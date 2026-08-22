import {
  isProProfileComplete,
  OnboardingStatus,
  type ExperienceLevel,
  type ProProfile,
} from '@samona/types';
import type { OnboardingPatchInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import { badRequest } from '../common/errors';

export interface ProsServiceDeps {
  prisma: PrismaClient;
}

/** Prisma row plus its join rows, as every read here selects them. */
const proProfileSelect = {
  id: true,
  userId: true,
  onboardingStatus: true,
  displayName: true,
  bio: true,
  experienceLevel: true,
  serviceRadiusKm: true,
  latitude: true,
  longitude: true,
  locationLabel: true,
  languages: true,
  isOnline: true,
  isVerified: true,
  rating: true,
  completedJobs: true,
  services: { select: { serviceId: true } },
  skills: { select: { skillId: true } },
} as const;

type ProProfileRow = {
  services: { serviceId: string }[];
  skills: { skillId: string }[];
} & Omit<ProProfile, 'serviceIds' | 'skillIds'>;

function toProProfile(row: ProProfileRow): ProProfile {
  const { services, skills, ...rest } = row;
  return {
    ...rest,
    serviceIds: services.map((s) => s.serviceId),
    skillIds: skills.map((s) => s.skillId),
  };
}

/**
 * Pros domain service.
 *
 * Owns the professional profile and its onboarding. Identity lives in
 * `profiles`; this is only the "what kind of professional are they" layer.
 */
export function createProsService(deps: ProsServiceDeps) {
  /** The catalogue offered in onboarding steps 3 and 4. */
  async function listCatalogue() {
    const services = await deps.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        skills: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, serviceId: true, slug: true, name: true },
        },
      },
    });

    return {
      services: services.map(({ skills: _skills, ...service }) => service),
      skills: services.flatMap((service) => service.skills),
    };
  }

  async function findByUserId(userId: string): Promise<ProProfile | null> {
    const row = await deps.prisma.proProfile.findUnique({
      where: { userId },
      select: proProfileSelect,
    });
    return row ? toProProfile(row as ProProfileRow) : null;
  }

  /**
   * Returns the Pro profile, creating an empty one on first access.
   *
   * `upsert` rather than create: a double-tapped "start onboarding" would
   * otherwise race and one request would fail the unique constraint on
   * `user_id`. That uniqueness is what guarantees one profile per account.
   */
  async function ensureForUser(userId: string): Promise<ProProfile> {
    const row = await deps.prisma.proProfile.upsert({
      where: { userId },
      create: { userId, onboardingStatus: OnboardingStatus.NOT_STARTED },
      update: {},
      select: proProfileSelect,
    });
    return toProProfile(row as ProProfileRow);
  }

  /**
   * Applies one onboarding step.
   *
   * Steps save as the Pro goes, so closing the app never loses answers already
   * given. Only the keys present are written; a step cannot blank another's.
   *
   * `onboardingStatus` is derived from the resulting data rather than trusted
   * from the client — a client could otherwise declare itself COMPLETED with an
   * empty profile and walk into the app.
   */
  async function applyOnboardingPatch(
    userId: string,
    patch: OnboardingPatchInput,
  ): Promise<ProProfile> {
    const existing = await ensureForUser(userId);

    if (patch.skillIds?.length) {
      await assertSkillsBelongToServices(patch.skillIds, patch.serviceIds ?? existing.serviceIds);
    }

    const updated = await deps.prisma.$transaction(async (tx) => {
      await tx.proProfile.update({
        where: { userId },
        data: {
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
          ...(patch.experienceLevel !== undefined
            ? { experienceLevel: patch.experienceLevel as ExperienceLevel }
            : {}),
          ...(patch.serviceRadiusKm !== undefined
            ? { serviceRadiusKm: patch.serviceRadiusKm }
            : {}),
          ...(patch.coordinates !== undefined
            ? { latitude: patch.coordinates.latitude, longitude: patch.coordinates.longitude }
            : {}),
          ...(patch.locationLabel !== undefined ? { locationLabel: patch.locationLabel } : {}),
          ...(patch.languages !== undefined ? { languages: patch.languages } : {}),
        },
      });

      // Replace rather than merge: the step's selection is the full answer, so
      // deselecting a service must actually remove it.
      if (patch.serviceIds) {
        await tx.proService.deleteMany({ where: { proProfileId: existing.id } });
        await tx.proService.createMany({
          data: patch.serviceIds.map((serviceId) => ({
            proProfileId: existing.id,
            serviceId,
          })),
          skipDuplicates: true,
        });

        // Dropping a service must drop the specialties beneath it, or the
        // profile keeps skills for work the Pro no longer offers.
        await tx.proSkill.deleteMany({
          where: {
            proProfileId: existing.id,
            skill: { serviceId: { notIn: patch.serviceIds } },
          },
        });
      }

      if (patch.skillIds) {
        await tx.proSkill.deleteMany({ where: { proProfileId: existing.id } });
        await tx.proSkill.createMany({
          data: patch.skillIds.map((skillId) => ({ proProfileId: existing.id, skillId })),
          skipDuplicates: true,
        });
      }

      const row = await tx.proProfile.findUniqueOrThrow({
        where: { userId },
        select: proProfileSelect,
      });
      return toProProfile(row as ProProfileRow);
    });

    return recomputeStatus(updated);
  }

  /** Derives and persists onboarding status from the profile's own data. */
  async function recomputeStatus(profile: ProProfile): Promise<ProProfile> {
    const complete = isProProfileComplete(profile);
    const hasAnyAnswer =
      Boolean(profile.displayName) || profile.serviceIds.length > 0 || Boolean(profile.bio);

    const status = complete
      ? OnboardingStatus.COMPLETED
      : hasAnyAnswer
        ? OnboardingStatus.IN_PROGRESS
        : OnboardingStatus.NOT_STARTED;

    if (status === profile.onboardingStatus) return profile;

    await deps.prisma.proProfile.update({
      where: { id: profile.id },
      data: { onboardingStatus: status },
    });
    return { ...profile, onboardingStatus: status };
  }

  /** Rejects specialties that do not belong to a service the Pro selected. */
  async function assertSkillsBelongToServices(
    skillIds: string[],
    serviceIds: string[],
  ): Promise<void> {
    if (serviceIds.length === 0) {
      throw badRequest('Choose your services before choosing specialties.');
    }

    const valid = await deps.prisma.skill.count({
      where: { id: { in: skillIds }, serviceId: { in: serviceIds } },
    });

    if (valid !== skillIds.length) {
      throw badRequest('Some specialties do not belong to the services you selected.');
    }
  }

  return { listCatalogue, findByUserId, ensureForUser, applyOnboardingPatch };
}

export type ProsService = ReturnType<typeof createProsService>;

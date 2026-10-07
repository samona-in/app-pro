import {
  isProProfileComplete,
  OnboardingStatus,
  type ExperienceLevel,
  type Gender,
  type ProProfile,
  type ProServiceStatus,
} from '@samona/types';
import type { OnboardingPatchInput, AvailabilityPatchInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import { badRequest } from '../common/errors';
import type { JobsService } from '../jobs/jobs.service';

export interface ProsServiceDeps {
  prisma: PrismaClient;
  /** Builds the read URL for a stored selfie; also probes upload completion. */
  storage: StorageService;
  /** Pages a returning pro the still-open requests they missed while offline. */
  jobs: JobsService;
}

/** Prisma row plus its join rows, as every read here selects them. */
const proProfileSelect = {
  id: true,
  userId: true,
  onboardingStatus: true,
  displayName: true,
  gender: true,
  bio: true,
  experienceLevel: true,
  serviceRadiusKm: true,
  latitude: true,
  longitude: true,
  locationLabel: true,
  languages: true,
  selfiePhotoPath: true,
  isOnline: true,
  isVerified: true,
  rating: true,
  completedJobs: true,
  services: {
    select: {
      serviceId: true,
      status: true,
      rejectionReason: true,
      service: { select: { slug: true, name: true, icon: true } },
    },
  },
  skills: { select: { skillId: true } },
} as const;

type ProServiceRow = {
  serviceId: string;
  status: ProServiceStatus;
  rejectionReason: string | null;
  service: { slug: string; name: string; icon: string | null };
};

type ProProfileRow = {
  services: ProServiceRow[];
  skills: { skillId: string }[];
  selfiePhotoPath: string | null;
} & Omit<ProProfile, 'serviceIds' | 'skillIds' | 'hasSelfie' | 'selfiePhotoUrl' | 'proServices'>;

function toProProfile(row: ProProfileRow, storage: StorageService): ProProfile {
  const { services, skills, selfiePhotoPath, ...rest } = row;
  return {
    ...rest,
    hasSelfie: selfiePhotoPath !== null,
    selfiePhotoUrl: selfiePhotoPath ? storage.selfiePublicUrl(selfiePhotoPath) : null,
    serviceIds: services.map((s) => s.serviceId),
    skillIds: skills.map((s) => s.skillId),
    proServices: services.map((s) => ({
      id: s.serviceId,
      slug: s.service.slug,
      name: s.service.name,
      icon: s.service.icon,
      status: s.status,
      rejectionReason: s.rejectionReason,
    })),
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
    return row ? toProProfile(row as ProProfileRow, deps.storage) : null;
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
    return toProProfile(row as ProProfileRow, deps.storage);
  }

  /**
   * Records that the caller's selfie finished uploading.
   *
   * The files route has already confirmed the object exists in the bucket;
   * this writes the deterministic path and re-derives onboarding status, which
   * is what makes the face step a real gate rather than a UI suggestion.
   */
  async function setSelfieUploaded(userId: string): Promise<ProProfile> {
    const existing = await ensureForUser(userId);

    const row = await deps.prisma.proProfile.update({
      where: { id: existing.id },
      data: {
        selfiePhotoPath: deps.storage.selfiePath(userId),
        selfieCapturedAt: new Date(),
      },
      select: proProfileSelect,
    });

    return recomputeStatus(toProProfile(row as ProProfileRow, deps.storage));
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
          ...(patch.gender !== undefined ? { gender: patch.gender as Gender } : {}),
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

      // The step's selection is the full answer for *which* services, so
      // deselecting must still remove the row — but rows that stay selected
      // keep their verification state. Wipe-and-recreate would demote every
      // ACCEPTED service back to PENDING and silently discard an admin's
      // rejection reason, so only the difference is written: drop what left,
      // insert what arrived (PENDING by column default), leave the rest.
      if (patch.serviceIds) {
        await tx.proService.deleteMany({
          where: { proProfileId: existing.id, serviceId: { notIn: patch.serviceIds } },
        });
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
      return toProProfile(row as ProProfileRow, deps.storage);
    });

    return recomputeStatus(updated);
  }

  /** Derives and persists onboarding status from the profile's own data. */
  async function recomputeStatus(profile: ProProfile): Promise<ProProfile> {
    const complete = isProProfileComplete(profile);
    const hasAnyAnswer =
      Boolean(profile.displayName) ||
      Boolean(profile.gender) ||
      profile.serviceIds.length > 0 ||
      Boolean(profile.bio);

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

  /**
   * The online/offline switch that gates matching.
   *
   * `isOnline` is server-controlled for a reason: an attacker must not be able
   * to toggle it at will once this becomes algorithmic. Coordinates refresh on
   * every online transition; going offline keeps the last known position.
   */
  async function setAvailability(
    userId: string,
    patch: AvailabilityPatchInput,
  ): Promise<ProProfile> {
    const existing = await ensureForUser(userId);

    const row = await deps.prisma.proProfile.update({
      where: { id: existing.id },
      data: {
        isOnline: patch.isOnline,
        ...(patch.coordinates
          ? { latitude: patch.coordinates.latitude, longitude: patch.coordinates.longitude }
          : {}),
        ...(patch.locationLabel !== undefined ? { locationLabel: patch.locationLabel } : {}),
      },
      select: proProfileSelect,
    });

    // Going online with a fresh position is the moment to catch a pro up on
    // requests raised while they were away. Fire-and-forget: catch-up must
    // never block the toggle response.
    if (
      patch.isOnline &&
      patch.coordinates &&
      typeof row.serviceRadiusKm === 'number' &&
      row.serviceRadiusKm > 0
    ) {
      void deps.jobs.notifyReadyJobRequests(userId, patch.coordinates);
    }

    return toProProfile(row as ProProfileRow, deps.storage);
  }

  return {
    listCatalogue,
    findByUserId,
    ensureForUser,
    applyOnboardingPatch,
    setSelfieUploaded,
    setAvailability,
  };
}

export type ProsService = ReturnType<typeof createProsService>;

import {
  isProProfileComplete,
  OnboardingStatus,
  ProServiceStatus,
  type ExperienceLevel,
  type Gender,
  type ProProfile,
  type ProServiceListItem,
} from '@samona/types';
import type { OnboardingPatchInput, AvailabilityPatchInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
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
  locationPlaceId: true,
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
          select: { id: true, serviceId: true, slug: true, name: true, icon: true },
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
          ...(patch.locationPlaceId !== undefined
            ? { locationPlaceId: patch.locationPlaceId }
            : {}),
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
   * Every active service with this Pro's verification status — the Manage
   * Services screen.
   *
   * The whole catalogue is listed, not just selected rows: `status: null`
   * means "never requested" and is what the Request button acts on. Scoped to
   * the caller's own profile, so a Pro can never see anyone else's verdicts.
   */
  async function listProServices(userId: string): Promise<ProServiceListItem[]> {
    const profile = await ensureForUser(userId);

    const [catalogue, rows] = await Promise.all([
      deps.prisma.service.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, slug: true, name: true, icon: true },
      }),
      deps.prisma.proService.findMany({
        where: { proProfileId: profile.id },
        select: { serviceId: true, status: true, rejectionReason: true },
      }),
    ]);

    const byService = new Map(rows.map((row) => [row.serviceId, row]));

    return catalogue.map((service) => {
      const row = byService.get(service.id);
      return {
        id: service.id,
        slug: service.slug,
        name: service.name,
        icon: service.icon,
        status: row?.status ?? null,
        rejectionReason: row?.rejectionReason ?? null,
      };
    });
  }

  /** The catalogue half of a `ProServiceListItem`; status comes from the row. */
  function toServiceEntry(service: {
    id: string;
    slug: string;
    name: string;
    icon: string | null;
  }): ProServiceListItem {
    return {
      id: service.id,
      slug: service.slug,
      name: service.name,
      icon: service.icon,
      status: null,
      rejectionReason: null,
    };
  }

  /**
   * Requests verification for one service, or re-requests it after rejection.
   *
   * The transition set is deliberately tiny — the client can only ever move a
   * row *towards* PENDING:
   *
   * - no row   → create it as PENDING (`skipDuplicates` absorbs a racing
   *              double-tap: the loser's insert is dropped, not an error)
   * - PENDING  → return it unchanged (idempotent; repeat taps are free)
   * - ACCEPTED → 409; there is nothing to request
   * - REJECTED → guarded `updateMany` on `status: REJECTED`, so only a still
   *              rejected row flips back to PENDING. A count of 0 means the
   *              row changed underneath us (a concurrent tap won, or an admin
   *              just decided) — read it back and answer for its current
   *              state instead of overwriting someone else's write.
   *
   * Nothing here can produce ACCEPTED; that verdict belongs to an admin.
   */
  async function requestProService(userId: string, serviceId: string): Promise<ProServiceListItem> {
    const profile = await ensureForUser(userId);

    if (profile.onboardingStatus !== OnboardingStatus.COMPLETED) {
      throw forbidden('Complete your onboarding first.');
    }

    const service = await deps.prisma.service.findFirst({
      where: { id: serviceId, isActive: true },
      select: { id: true, slug: true, name: true, icon: true },
    });
    if (!service) throw notFound('That service is not available.');

    const proProfileId = profile.id;
    const readBack = () =>
      deps.prisma.proService.findUnique({
        where: { proProfileId_serviceId: { proProfileId, serviceId } },
        select: { status: true, rejectionReason: true },
      });

    const existing = await readBack();

    if (existing?.status === ProServiceStatus.ACCEPTED) {
      throw conflict('That service is already approved for you.');
    }

    if (existing?.status === ProServiceStatus.PENDING) {
      return {
        ...toServiceEntry(service),
        status: existing.status,
        rejectionReason: existing.rejectionReason,
      };
    }

    if (existing) {
      // REJECTED. Flip it only while it still reads REJECTED.
      const flipped = await deps.prisma.proService.updateMany({
        where: { proProfileId, serviceId, status: ProServiceStatus.REJECTED },
        data: { status: ProServiceStatus.PENDING, rejectionReason: null },
      });
      if (flipped.count > 0) {
        return {
          ...toServiceEntry(service),
          status: ProServiceStatus.PENDING,
          rejectionReason: null,
        };
      }
      const current = await readBack();
      if (!current) throw conflict('That service changed state — try again.');
      if (current.status === ProServiceStatus.ACCEPTED) {
        throw conflict('That service is already approved for you.');
      }
      return { ...toServiceEntry(service), ...current };
    }

    // No row yet. skipDuplicates makes the create race-free without parsing
    // driver-specific unique-violation errors, and the read-back returns
    // whatever actually landed.
    await deps.prisma.proService.createMany({
      data: [{ proProfileId, serviceId }],
      skipDuplicates: true,
    });

    const created = await readBack();
    if (!created) throw conflict('That service changed state — try again.');
    return { ...toServiceEntry(service), ...created };
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

    // A pending deletion locks the pro out of the marketplace: going offline is
    // the last meaningful availability change, and it is not reversible from
    // the app once deletion is accepted. A finished tombstone blocks it too.
    const gate = await deps.prisma.proProfile.findUnique({
      where: { userId },
      select: { deletedAt: true, deletionRequestedAt: true },
    });
    if (gate?.deletedAt || gate?.deletionRequestedAt) {
      throw conflict('Your account deletion is in progress. You cannot go back online.');
    }

    const row = await deps.prisma.proProfile.update({
      where: { id: existing.id },
      data: {
        isOnline: patch.isOnline,
        ...(patch.coordinates
          ? { latitude: patch.coordinates.latitude, longitude: patch.coordinates.longitude }
          : {}),
        ...(patch.locationLabel !== undefined ? { locationLabel: patch.locationLabel } : {}),
        ...(patch.locationPlaceId !== undefined
          ? { locationPlaceId: patch.locationPlaceId }
          : {}),
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

  /**
   * Updates how far this pro will travel to jobs — the Service Areas screen.
   *
   * Scoped to the caller's own row (matched on `userId`, never a
   * client-supplied id). Bounds live in `serviceRadiusSchema`. No onboarding
   * status recompute: the column defaults to 10 and every accepted value is
   * ≥ 1, so `serviceRadiusKm > 0` already holds and completeness — which
   * only checks that it is positive — cannot change here.
   */
  async function setServiceRadius(
    userId: string,
    serviceRadiusKm: number,
  ): Promise<{ serviceRadiusKm: number }> {
    await ensureForUser(userId);

    const row = await deps.prisma.proProfile.update({
      where: { userId },
      data: { serviceRadiusKm },
      select: { serviceRadiusKm: true },
    });

    return { serviceRadiusKm: row.serviceRadiusKm };
  }

  return {
    listCatalogue,
    findByUserId,
    ensureForUser,
    applyOnboardingPatch,
    setSelfieUploaded,
    setAvailability,
    setServiceRadius,
    listProServices,
    requestProService,
  };
}

export type ProsService = ReturnType<typeof createProsService>;

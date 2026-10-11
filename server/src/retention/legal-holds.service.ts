import type { PrismaClient } from '../database/prisma';
import type { LegalHoldHolderType } from './types';

export interface LegalHoldServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
}

export function createLegalHoldService(deps: LegalHoldServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /**
   * The distinct holder ids with a live hold of the given type(s).
   *
   * Cleanup walks candidates in bulk, so it needs the held set in one query
   * rather than a per-row check. A hold is live while it is active and either
   * open-ended or not yet expired.
   */
  async function listActiveHolderIds(
    holderTypes: LegalHoldHolderType | readonly LegalHoldHolderType[],
  ): Promise<string[]> {
    const types = Array.isArray(holderTypes) ? holderTypes : [holderTypes];
    const holds = await deps.prisma.legalHold.findMany({
      where: {
        active: true,
        holderType: { in: [...types] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
      },
      select: { holderId: true },
    });
    return [...new Set(holds.map((hold) => hold.holderId))];
  }

  async function hasActiveHold(
    holderType: LegalHoldHolderType,
    holderId: string,
  ): Promise<boolean> {
    const count = await deps.prisma.legalHold.count({
      where: {
        holderType,
        holderId,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
      },
    });
    return count > 0;
  }

  async function hasAnyActiveHoldForProfile(profileId: string): Promise<boolean> {
    const count = await deps.prisma.legalHold.count({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
        AND: [
          {
            OR: [
              { holderType: 'PROFILE', holderId: profileId },
              { holderType: 'PRO_PROFILE', holderId: profileId },
              { holderType: 'CUSTOMER_PROFILE', holderId: profileId },
            ],
          },
        ],
      },
    });
    return count > 0;
  }

  async function createHold(data: {
    holderType: LegalHoldHolderType;
    holderId: string;
    reason: string;
    authorizedBy: string;
    notes?: string | null;
    expiresAt?: Date | null;
  }) {
    return deps.prisma.legalHold.create({
      data: {
        holderType: data.holderType,
        holderId: data.holderId,
        reason: data.reason,
        authorizedBy: data.authorizedBy,
        notes: data.notes ?? null,
        expiresAt: data.expiresAt ?? null,
        active: true,
      },
    });
  }

  async function releaseHold(id: string, releasedBy: string) {
    return deps.prisma.legalHold.update({
      where: { id },
      data: { active: false, releasedAt: now(), releasedBy },
    });
  }

  return {
    hasActiveHold,
    hasAnyActiveHoldForProfile,
    listActiveHolderIds,
    createHold,
    releaseHold,
  };
}

export type LegalHoldService = ReturnType<typeof createLegalHoldService>;

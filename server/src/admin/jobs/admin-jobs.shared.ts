import type { PrismaClient } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Pieces shared by the bookings ledger (`/admin/jobs`) and the live board
 * (`/admin/live`).
 *
 * Both views describe the same job row, so their select, DTO and search
 * behaviour live here rather than being copied — a field added for the ledger
 * should not silently go missing from the live board.
 */

/**
 * The row shape shared by the list and the detail response.
 *
 * `deletedAt` is selected on both parties so a tombstoned account's PII can be
 * withheld while its job history stays intact (see the account-deletion docs).
 * `verificationOtp`, `JobOffer.tokenHash` and `JobOffer.deviceId` are never
 * selected: they are customer/pro credentials, not admin data.
 */
export const jobBaseSelect = {
  id: true,
  status: true,
  createdAt: true,
  acceptedAt: true,
  completedAt: true,
  cancelledAt: true,
  expiresAt: true,
  locationLabel: true,
  basePayPaise: true,
  agreedPayPaise: true,
  finalPayPaise: true,
  customSkill: true,
  customer: {
    select: {
      id: true,
      displayName: true,
      deletedAt: true,
      profile: { select: { id: true, fullName: true, phone: true } },
    },
  },
  pro: {
    select: {
      id: true,
      displayName: true,
      deletedAt: true,
      profile: { select: { id: true, fullName: true, phone: true } },
    },
  },
  service: { select: { id: true, name: true, slug: true } },
  skill: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.JobSelect;

export const jobListSelect = jobBaseSelect;

export type JobListRow = Prisma.JobGetPayload<{ select: typeof jobListSelect }>;

export function toJobListDto(job: JobListRow) {
  const customerDeleted = Boolean(job.customer.deletedAt);
  const proDeleted = Boolean(job.pro?.deletedAt);

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    acceptedAt: iso(job.acceptedAt),
    completedAt: iso(job.completedAt),
    cancelledAt: iso(job.cancelledAt),
    expiresAt: iso(job.expiresAt),
    locationLabel: job.locationLabel,
    basePayPaise: job.basePayPaise,
    agreedPayPaise: job.agreedPayPaise,
    finalPayPaise: job.finalPayPaise,
    customSkill: job.customSkill,
    customer: {
      id: job.customer.id,
      displayName: customerDeleted ? null : customerName(job.customer),
      phone: customerDeleted ? null : (job.customer.profile?.phone ?? null),
    },
    pro: job.pro
      ? {
          id: job.pro.id,
          displayName: proDeleted ? null : proName(job.pro),
          phone: proDeleted ? null : (job.pro.profile?.phone ?? null),
        }
      : null,
    service: job.service,
    skill: job.skill,
  };
}

export function customerName(customer: {
  displayName: string | null;
  profile: { fullName: string | null } | null;
}): string | null {
  return customer.displayName ?? customer.profile?.fullName ?? null;
}

export function proName(pro: {
  displayName: string | null;
  profile: { fullName: string | null } | null;
}): string | null {
  return pro.displayName ?? pro.profile?.fullName ?? null;
}

export function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Free-text lookup across the things an operator actually has on hand: a job
 * id from a support ticket, a phone fragment, or a name.
 *
 * Postgres UUID columns do not support `LIKE` in Prisma, so a partial id is
 * resolved with one bounded prefix query before filtering on the ids. `contains`
 * on phone works because stored numbers are E.164 (digits and a leading `+`),
 * so stripping punctuation from the query cannot miss.
 */
export async function buildJobSearchCondition(
  client: PrismaClient,
  raw: string,
): Promise<Prisma.JobWhereInput | null> {
  const q = raw.trim();
  if (!q) return null;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
    return { id: q.toLowerCase() };
  }

  if (/^[0-9a-f]{6,36}(?:-[0-9a-f]{1,12}){0,4}$/i.test(q)) {
    const prefix = `${q.toLowerCase()}%`;
    const matches = await client.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id FROM jobs WHERE id::text LIKE ${prefix} LIMIT 50
    `;
    return { id: { in: matches.map((row) => row.id) } };
  }

  const digits = q.replace(/\D/g, '');
  if (/^\+?[\d\s-]+$/.test(q) && digits.length >= 3) {
    return {
      OR: [
        { customer: { profile: { phone: { contains: digits } } } },
        { pro: { profile: { phone: { contains: digits } } } },
      ],
    };
  }

  if (!/[a-z]/i.test(q)) return null;

  return {
    OR: [
      { customer: { displayName: { contains: q, mode: 'insensitive' } } },
      { customer: { profile: { fullName: { contains: q, mode: 'insensitive' } } } },
      { pro: { displayName: { contains: q, mode: 'insensitive' } } },
      { pro: { profile: { fullName: { contains: q, mode: 'insensitive' } } } },
    ],
  };
}

import {
  OTHER_SKILL_SLUG,
  type BookingCart,
  type BookingCartGroup,
  type BookingDraftItem,
  type BookingDraftSkill,
  type PricingModel,
} from '@samona/types';
import type { SaveBookingCartInput } from '@samona/validation';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { priceJob } from '../jobs/job-pricing';

export interface DraftsServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
}

/**
 * The catalogue fields a draft's work needs to re-open the cart steppers
 * without a second catalogue read, plus the current price used to re-estimate.
 */
const draftSkillSelect = {
  id: true,
  serviceId: true,
  slug: true,
  name: true,
  icon: true,
  basePricePaise: true,
  pricingModel: true,
  unitLabel: true,
  minQuantity: true,
  maxQuantity: true,
  minDurationMinutes: true,
  maxDurationMinutes: true,
  durationStepMinutes: true,
} as const;

const draftInclude = {
  service: { select: { id: true, slug: true, name: true, icon: true } },
  items: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      sortOrder: true,
      customSkill: true,
      pricingModel: true,
      unitPricePaise: true,
      quantity: true,
      unitLabel: true,
      durationMinutes: true,
      subtotalPaise: true,
      skill: { select: draftSkillSelect },
    },
  },
} satisfies Prisma.BookingDraftInclude;

type DraftRow = Prisma.BookingDraftGetPayload<{ include: typeof draftInclude }>;

/** Prisma's unique-constraint violation (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function toDraftItems(row: DraftRow): BookingDraftItem[] {
  return row.items.map(
    (item): BookingDraftItem => ({
      id: item.id,
      sortOrder: item.sortOrder,
      skill: item.skill as BookingDraftSkill,
      customSkill: item.customSkill,
      pricingModel: item.pricingModel as PricingModel,
      unitPricePaise: item.unitPricePaise,
      quantity: item.quantity,
      unitLabel: item.unitLabel,
      durationMinutes: item.durationMinutes,
      subtotalPaise: item.subtotalPaise,
    }),
  );
}

function toGroup(row: DraftRow): BookingCartGroup {
  return {
    id: row.id,
    service: row.service,
    estimatedTotalPaise: row.estimatedTotalPaise,
    items: toDraftItems(row),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The cart as the app reads it: one group per service, sharing the visit's
 * notes and photos, with a total that is the sum of the groups' estimates.
 */
function toCartDto(rows: DraftRow[], storage: StorageService): BookingCart | null {
  if (rows.length === 0) return null;

  const newest = rows.reduce((latest, row) => (row.updatedAt > latest.updatedAt ? row : latest));

  return {
    description: newest.description,
    imagePaths: newest.imagePaths,
    imageUrls: newest.imagePaths.map((path) => storage.jobImagePublicUrl(path)),
    groups: rows.map(toGroup),
    estimatedTotalPaise: rows.reduce((sum, row) => sum + row.estimatedTotalPaise, 0),
    updatedAt: newest.updatedAt.toISOString(),
  };
}

/**
 * The customer's server-side booking cart.
 *
 * One customer has at most one ACTIVE draft per service (also enforced by a
 * partial unique index), and those rows together are their cart. A save
 * replaces the whole cart: the services, works, their order, the notes and the
 * photos all come from the client, while every price is recomputed from the
 * catalogue — a draft is an estimate, never a commitment.
 *
 * Clearing or dropping a service marks its ACTIVE row ABANDONED rather than
 * deleting it, so support and analytics keep the history. Converting a cart is
 * done by the jobs service inside the booking transaction, one row per service,
 * so a placed booking and its converted draft commit together.
 */
export function createDraftsService({ prisma, storage }: DraftsServiceDeps) {
  async function findActive(customerId: string): Promise<DraftRow[]> {
    return prisma.bookingDraft.findMany({
      where: { customerId, status: 'ACTIVE' },
      include: draftInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** The caller's current cart, or null when there is nothing in progress. */
  async function getCurrent(customerUserId: string): Promise<BookingCart | null> {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerUserId },
      select: { id: true },
    });
    if (!customer) return null;

    return toCartDto(await findActive(customer.id), storage);
  }

  /**
   * Saves (or clears) the caller's whole cart.
   *
   * An empty `groups` list abandons every active group and returns null. A
   * service that disappears from the cart is abandoned, a new one is created,
   * and an existing one is replaced — all in one transaction.
   */
  async function saveCurrent(
    customerUserId: string,
    input: SaveBookingCartInput,
  ): Promise<BookingCart | null> {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerUserId },
      select: { id: true, deletedAt: true, deletionRequestedAt: true },
    });
    if (!customer) {
      throw notFound('Your profile is not ready yet. Try again in a moment.');
    }
    if (customer.deletedAt || customer.deletionRequestedAt) {
      throw conflict('Your account is being deleted and can no longer place bookings.');
    }

    // Clearing the cart is a soft delete: the rows stay as history.
    if (input.groups.length === 0) {
      await prisma.bookingDraft.updateMany({
        where: { customerId: customer.id, status: 'ACTIVE' },
        data: { status: 'ABANDONED' },
      });
      return null;
    }

    // A draft photo must belong to this caller's own folder, exactly like a
    // submitted booking. Existence is not checked here: a cart is saved while
    // the customer is still working and the final booking verifies the bytes.
    const imageScope = `jobs/${customerUserId}/`;
    if (!input.imagePaths.every((path) => path.startsWith(imageScope))) {
      throw badRequest('One of the photos is not valid.');
    }

    // Resolve and price every service's works from the catalogue before
    // writing anything, so a bad service or work leaves the cart untouched.
    const groups = await Promise.all(
      input.groups.map(async (group) => {
        const service = await prisma.service.findFirst({
          where: { slug: group.serviceSlug, isActive: true },
          select: { id: true, slug: true, name: true, icon: true },
        });
        if (!service) {
          throw badRequest('That service is no longer bookable.');
        }

        const requestedSlugs = [...new Set(group.items.map((item) => item.skillSlug))];
        const skills = await prisma.skill.findMany({
          where: { slug: { in: requestedSlugs }, serviceId: service.id, isActive: true },
          select: draftSkillSelect,
        });
        const skillsBySlug = new Map(skills.map((skill) => [skill.slug, skill] as const));

        const pricedItems = group.items.map((item, index) => {
          const skill = skillsBySlug.get(item.skillSlug);
          if (!skill) {
            throw badRequest('That job category does not belong to the chosen service.');
          }

          const customSkill = item.customSkill ?? null;
          if (item.skillSlug === OTHER_SKILL_SLUG && !customSkill) {
            throw badRequest('Tell us what you need done.');
          }
          if (item.skillSlug !== OTHER_SKILL_SLUG && customSkill) {
            throw badRequest('Only the "Other" category takes a custom skill.');
          }

          return {
            sortOrder: index,
            skill,
            customSkill,
            pricing: priceJob(skill, item.quantity, item.durationMinutes),
          };
        });

        return {
          service,
          pricedItems,
          estimatedTotalPaise: pricedItems.reduce(
            (sum, item) => sum + item.pricing.totalPaise,
            0,
          ),
        };
      }),
    );

    const persist = (): Promise<DraftRow[]> =>
      prisma.$transaction(async (tx) => {
        const active = await tx.bookingDraft.findMany({
          where: { customerId: customer.id, status: 'ACTIVE' },
          select: { id: true, serviceId: true },
        });

        // A service the customer removed from the cart is abandoned, not
        // deleted, so its history survives.
        const keptServices = new Set(groups.map((group) => group.service.id));
        const removed = active.filter((draft) => !keptServices.has(draft.serviceId));
        if (removed.length > 0) {
          await tx.bookingDraft.updateMany({
            where: { id: { in: removed.map((draft) => draft.id) } },
            data: { status: 'ABANDONED' },
          });
        }

        const activeByService = new Map(active.map((draft) => [draft.serviceId, draft.id] as const));
        const saved: DraftRow[] = [];
        for (const group of groups) {
          const data = {
            serviceId: group.service.id,
            description: input.description,
            imagePaths: input.imagePaths,
            estimatedTotalPaise: group.estimatedTotalPaise,
            items: {
              create: group.pricedItems.map((item) => ({
                sortOrder: item.sortOrder,
                skillId: item.skill.id,
                customSkill: item.customSkill,
                pricingModel: item.pricing.pricingModel,
                unitPricePaise: item.pricing.unitPricePaise,
                quantity: item.pricing.quantity,
                unitLabel: item.pricing.unitLabel,
                durationMinutes: item.pricing.durationMinutes,
                subtotalPaise: item.pricing.totalPaise,
              })),
            },
          };

          const existingId = activeByService.get(group.service.id);
          if (existingId) {
            await tx.bookingDraftItem.deleteMany({ where: { draftId: existingId } });
            saved.push(
              await tx.bookingDraft.update({
                where: { id: existingId },
                data,
                include: draftInclude,
              }),
            );
          } else {
            saved.push(
              await tx.bookingDraft.create({
                data: { customerId: customer.id, ...data },
                include: draftInclude,
              }),
            );
          }
        }
        return saved;
      });

    let saved: DraftRow[];
    try {
      saved = await persist();
    } catch (error) {
      // A concurrent save created the same service's ACTIVE draft between our
      // read and write; the partial unique index rejects the second create.
      // The failed transaction rolled back, so re-run it against fresh state.
      if (!isUniqueViolation(error)) throw error;
      saved = await persist();
    }

    return toCartDto(saved, storage);
  }

  /** Abandons the caller's active cart, if any. Idempotent. */
  async function clearCurrent(customerUserId: string): Promise<void> {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerUserId },
      select: { id: true },
    });
    if (!customer) return;

    await prisma.bookingDraft.updateMany({
      where: { customerId: customer.id, status: 'ACTIVE' },
      data: { status: 'ABANDONED' },
    });
  }

  return { getCurrent, saveCurrent, clearCurrent };
}

export type DraftsService = ReturnType<typeof createDraftsService>;

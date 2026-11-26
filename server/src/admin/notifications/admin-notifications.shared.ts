import { individualAudienceFiltersSchema } from '@samona/validation';
import { resolveCampaignRoute } from '@samona/config';
import { badRequest } from '../../common/errors';
import type { PrismaClient } from '../../database/prisma';

/** Audiences that address exactly one profile on one surface. */
export type IndividualAudience = 'INDIVIDUAL_PRO' | 'INDIVIDUAL_CUSTOMER';

export type IndividualSurface = 'PRO' | 'CUSTOMER';

/** A server-resolved target. Neither the id nor the surface is client-trusted. */
export interface IndividualRecipient {
  surface: IndividualSurface;
  profileId: string;
  /** The auth identity, used for delivery lookup and the campaign recipient row. */
  userId: string;
  name: string | null;
  phone: string | null;
}

const INDIVIDUAL_AUDIENCES: readonly string[] = ['INDIVIDUAL_PRO', 'INDIVIDUAL_CUSTOMER'];

export function isIndividualAudience(audience: unknown): audience is IndividualAudience {
  return typeof audience === 'string' && INDIVIDUAL_AUDIENCES.includes(audience);
}

const PRO_AUDIENCES: readonly string[] = [
  'ALL_PROFESSIONALS',
  'VERIFIED_PROFESSIONALS',
  'ONLINE_PROFESSIONALS',
  'OFFLINE_PROFESSIONALS',
  'PROFESSIONALS_INCOMPLETE_PROFILES',
];
const CUSTOMER_AUDIENCES: readonly string[] = [
  'ALL_CUSTOMERS',
  'CUSTOMERS_NOT_BOOKED_RECENTLY',
  'CUSTOMERS_WITH_COMPLETED_BOOKINGS',
];

/**
 * Validates a new campaign's deep link against the same allowlist the apps use.
 * Mixed audiences only keep routes valid in *both* apps. Existing campaigns are
 * not rewritten; their stored deep links simply stay inert if not allowlisted.
 */
export function validateCampaignDeepLink(audience: string, deepLink: unknown): string | null {
  if (deepLink === undefined || deepLink === null || deepLink === '') return null;

  const proOnly = isIndividualAudience(audience)
    ? audience === 'INDIVIDUAL_PRO'
    : PRO_AUDIENCES.includes(audience);
  const customerOnly = isIndividualAudience(audience)
    ? audience === 'INDIVIDUAL_CUSTOMER'
    : CUSTOMER_AUDIENCES.includes(audience);

  if (proOnly) {
    const route = resolveCampaignRoute(deepLink, 'PRO');
    if (!route) throw badRequest('Choose a deep link available in the professional app.');
    return route;
  }
  if (customerOnly) {
    const route = resolveCampaignRoute(deepLink, 'CUSTOMER');
    if (!route) throw badRequest('Choose a deep link available in the customer app.');
    return route;
  }

  const proRoute = resolveCampaignRoute(deepLink, 'PRO');
  if (proRoute && resolveCampaignRoute(deepLink, 'CUSTOMER')) return proRoute;
  throw badRequest('Choose a deep link available in both apps.');
}

/** Parses the only filter shape individual audiences accept. */
export function parseIndividualFilters(filters: unknown): { recipientId: string } {
  const parsed = individualAudienceFiltersSchema.safeParse(filters);
  if (!parsed.success) throw badRequest('Select a valid recipient.');
  return parsed.data;
}

/**
 * Resolves a selected profile against the requested surface.
 *
 * A pro id can never satisfy a customer audience (or vice versa), and a
 * tombstoned or deletion-pending profile is refused before anything is sent.
 */
export async function resolveIndividualRecipient(
  client: PrismaClient,
  audience: IndividualAudience,
  filters: unknown,
): Promise<IndividualRecipient> {
  const { recipientId } = parseIndividualFilters(filters);

  if (audience === 'INDIVIDUAL_PRO') {
    const pro = await client.proProfile.findUnique({
      where: { id: recipientId },
      select: {
        id: true,
        userId: true,
        deletedAt: true,
        deletionRequestedAt: true,
        displayName: true,
        profile: { select: { fullName: true, phone: true, isActive: true, deletedAt: true } },
      },
    });
    if (
      !pro ||
      pro.deletedAt ||
      pro.deletionRequestedAt ||
      !pro.profile.isActive ||
      pro.profile.deletedAt
    ) {
      throw badRequest('The selected professional is not available.');
    }
    return {
      surface: 'PRO',
      profileId: pro.id,
      userId: pro.userId,
      name: pro.displayName ?? pro.profile.fullName,
      phone: pro.profile.phone,
    };
  }

  const customer = await client.customerProfile.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      userId: true,
      deletedAt: true,
      deletionRequestedAt: true,
      displayName: true,
      profile: { select: { fullName: true, phone: true, isActive: true, deletedAt: true } },
    },
  });
  if (
    !customer ||
    !customer.userId ||
    customer.deletedAt ||
    customer.deletionRequestedAt ||
    !customer.profile?.isActive ||
    customer.profile?.deletedAt
  ) {
    throw badRequest('The selected customer is not available.');
  }
  return {
    surface: 'CUSTOMER',
    profileId: customer.id,
    userId: customer.userId,
    name: customer.displayName ?? customer.profile.fullName,
    phone: customer.profile.phone,
  };
}

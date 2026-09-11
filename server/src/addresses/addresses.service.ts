import type { AddressLabel, SavedAddress } from '@samona/types';
import type { SavedAddressCreateInput, SavedAddressUpdateInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import { conflict, notFound } from '../common/errors';

export interface AddressesServiceDeps {
  prisma: PrismaClient;
}

/** How many saved addresses one customer may keep. */
export const ADDRESS_LIMIT = 10;

/** Columns a saved address is read back with. */
const savedAddressSelect = {
  id: true,
  label: true,
  addressLine1: true,
  addressLine2: true,
  landmark: true,
  locality: true,
  city: true,
  state: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SavedAddressRow = {
  [K in keyof Omit<SavedAddress, 'createdAt' | 'updatedAt'>]: SavedAddress[K];
} & { createdAt: Date; updatedAt: Date };

function toSavedAddress(row: SavedAddressRow): SavedAddress {
  return {
    ...row,
    label: row.label as AddressLabel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Addresses domain service.
 *
 * Owns a customer's saved addresses (Home / Work / Other). Every query is
 * scoped to `userId` — the id in the path is only ever matched *together with*
 * the caller's own id, so one account can never read or mutate another's rows
 * (CLAUDE.md "Security"). The single-default rule is enforced here in
 * transactions, never trusted from the client.
 */
export function createAddressesService(deps: AddressesServiceDeps) {
  async function listForUser(userId: string): Promise<SavedAddress[]> {
    const rows = await deps.prisma.savedAddress.findMany({
      where: { userId },
      select: savedAddressSelect,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((row) => toSavedAddress(row as SavedAddressRow));
  }

  async function create(userId: string, input: SavedAddressCreateInput): Promise<SavedAddress> {
    const own = deps.prisma.savedAddress.count({ where: { userId } });

    const existing = await own;
    if (existing >= ADDRESS_LIMIT) {
      throw conflict(`You can save up to ${ADDRESS_LIMIT} addresses.`);
    }

    const shouldBeDefault = input.isDefault === true || existing === 0;

    const row = await deps.prisma.$transaction(async (tx) => {
      // Nothing to clear when this is the very first address.
      if (shouldBeDefault && existing > 0) {
        await tx.savedAddress.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      return tx.savedAddress.create({
        data: {
          userId,
          label: input.label as AddressLabel,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          landmark: input.landmark ?? null,
          locality: input.locality ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          postalCode: input.postalCode ?? null,
          latitude: input.coordinates.latitude,
          longitude: input.coordinates.longitude,
          isDefault: shouldBeDefault,
        },
        select: savedAddressSelect,
      });
    });

    return toSavedAddress(row as SavedAddressRow);
  }

  async function update(
    userId: string,
    id: string,
    input: SavedAddressUpdateInput,
  ): Promise<SavedAddress> {
    const existing = await deps.prisma.savedAddress.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) throw notFound('Saved address not found.');

    const promote = input.isDefault === true;

    const row = await deps.prisma.$transaction(async (tx) => {
      if (promote) {
        await tx.savedAddress.updateMany({
          where: { id: { not: id }, userId },
          data: { isDefault: false },
        });
      }

      return tx.savedAddress.update({
        where: { id },
        data: {
          ...(input.label !== undefined ? { label: input.label as AddressLabel } : {}),
          ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
          ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
          ...(input.landmark !== undefined ? { landmark: input.landmark } : {}),
          ...(input.locality !== undefined ? { locality: input.locality } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
          ...(input.coordinates !== undefined
            ? { latitude: input.coordinates.latitude, longitude: input.coordinates.longitude }
            : {}),
          ...(promote ? { isDefault: true } : {}),
        },
        select: savedAddressSelect,
      });
    });

    return toSavedAddress(row as SavedAddressRow);
  }

  /**
   * Deletes one of the caller's saved addresses, idempotently.
   *
   * When the address being removed is the default, the earliest surviving one
   * is promoted so the account is never left without a default.
   */
  async function remove(userId: string, id: string): Promise<void> {
    await deps.prisma.$transaction(async (tx) => {
      const target = await tx.savedAddress.findFirst({
        where: { id, userId },
        select: { id: true, isDefault: true },
      });
      if (!target) return;

      await tx.savedAddress.delete({ where: { id } });

      if (target.isDefault) {
        const next = await tx.savedAddress.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.savedAddress.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });
  }

  return { listForUser, create, update, remove };
}

export type AddressesService = ReturnType<typeof createAddressesService>;
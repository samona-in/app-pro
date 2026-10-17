import { AddressLabel, type SavedAddress } from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import { createAddressesService, ADDRESS_LIMIT } from './addresses.service';

function addressRow(overrides: Partial<SavedAddress> = {}): SavedAddress {
  return {
    id: 'uuid-address-1',
    name: 'Aveen’s home',
    label: AddressLabel.HOME,
    addressLine1: '7-4A, Benz Circle',
    addressLine2: '',
    landmark: null,
    locality: null,
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    postalCode: '520010',
    latitude: 16.51,
    longitude: 80.64,
    placeId: null,
    isDefault: true,
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    ...overrides,
  };
}

/** A row as Prisma actually returns it: `createdAt`/`updatedAt` are Dates. */
function prismaRow(overrides: Partial<SavedAddress> = {}) {
  const row = addressRow(overrides);
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

type AddressClient = {
  count: jest.Mock;
  findMany: jest.Mock;
  findFirst: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
};

function buildService(mocks: Partial<Record<keyof AddressClient, jest.Mock>> = {}) {
  const client: AddressClient = {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(prismaRow()),
    update: jest.fn().mockResolvedValue(prismaRow()),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn().mockResolvedValue(prismaRow()),
    ...mocks,
  };

  const prisma = {
    savedAddress: client,
    // The transaction callback runs against the same stub so `tx` and
    // `deps.prisma.savedAddress` share one set of fns.
    $transaction: jest.fn((fn: (tx: { savedAddress: AddressClient }) => unknown) => fn({ savedAddress: client })),
  } as unknown as PrismaClient;

  return { service: createAddressesService({ prisma }), client: { savedAddress: client } };
}

describe('createAddressesService', () => {
  it('lists only the caller’s own addresses, default first', async () => {
    const { service, client } = buildService({
      findMany: jest.fn().mockResolvedValue([
        prismaRow(),
        prismaRow({ id: 'uuid-address-2', isDefault: false }),
      ]),
    });

    const rows = await service.listForUser('user-1');

    expect(client.savedAddress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.createdAt).toBe('2026-09-12T10:00:00.000Z');
  });

  it('creates and auto-defaults the very first address', async () => {
    const { service, client } = buildService({
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(
        prismaRow({ id: 'uuid-new', isDefault: true }),
      ),
    });

    const created = await service.create('user-1', {
      name: 'Aveen’s home',
      label: AddressLabel.HOME,
      addressLine1: '7-4A, Benz Circle',
      city: 'Vijayawada',
      coordinates: { latitude: 16.51, longitude: 80.64 },
    });

    expect(client.savedAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', name: 'Aveen’s home', isDefault: true }),
      }),
    );
    expect(client.savedAddress.updateMany).not.toHaveBeenCalled();
    expect(created.isDefault).toBe(true);
  });

  it('explicit isDefault unsets the previous default in the same transaction', async () => {
    const { service, client } = buildService({
      count: jest.fn().mockResolvedValue(3),
      create: jest.fn().mockResolvedValue(prismaRow({ id: 'uuid-new', isDefault: true })),
    });

    await service.create('user-1', {
      name: 'The office',
      label: AddressLabel.WORK,
      addressLine1: 'Tower A, MG Road',
      coordinates: { latitude: 78.5, longitude: 17.4 },
      isDefault: true,
    });

    expect(client.savedAddress.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { isDefault: false },
    });
    expect(client.savedAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
    );
  });

  it('rejects creating beyond the address limit', async () => {
    const { service } = buildService({ count: jest.fn().mockResolvedValue(ADDRESS_LIMIT) });

    await expect(
      service.create('user-1', {
        name: 'Misc',
        label: AddressLabel.OTHER,
        addressLine1: 'Some address',
        coordinates: { latitude: 1, longitude: 2 },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuses to update another account’s address', async () => {
    const { service } = buildService({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(
      service.update('user-1', 'uuid-other', { isDefault: true }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('updates the saved address name', async () => {
    const { service, client } = buildService({
      findFirst: jest.fn().mockResolvedValue(prismaRow({ id: 'uuid-address-1' })),
      update: jest.fn().mockResolvedValue(
        prismaRow({ id: 'uuid-address-1', name: 'Benz Circle crib' }),
      ),
    });

    const updated = await service.update('user-1', 'uuid-address-1', {
      name: 'Benz Circle crib',
    });

    expect(client.savedAddress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Benz Circle crib' }),
      }),
    );
    expect(updated.name).toBe('Benz Circle crib');
  });

  it('promotes a default only on the caller’s own rows', async () => {
    const { service, client } = buildService({
      findFirst: jest.fn().mockResolvedValue(prismaRow({ id: 'uuid-address-1' })),
      update: jest.fn().mockResolvedValue(prismaRow({ id: 'uuid-address-1', isDefault: true })),
    });

    const updated = await service.update('user-1', 'uuid-address-1', { isDefault: true });

    expect(client.savedAddress.updateMany).toHaveBeenCalledWith({
      where: { id: { not: 'uuid-address-1' }, userId: 'user-1' },
      data: { isDefault: false },
    });
    expect(updated.isDefault).toBe(true);
  });

  it('promotes the earliest remaining address when the default is deleted', async () => {
    const { service, client } = buildService({
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(prismaRow({ id: 'uuid-default' }))
        .mockResolvedValueOnce(prismaRow({ id: 'uuid-next', isDefault: false })),
    });

    await service.remove('user-1', 'uuid-default');

    expect(client.savedAddress.delete).toHaveBeenCalledWith({ where: { id: 'uuid-default' } });
    expect(client.savedAddress.update).toHaveBeenCalledWith({
      where: { id: 'uuid-next' },
      data: { isDefault: true },
    });
  });

  it('deleting is idempotent for an unknown id', async () => {
    const { service, client } = buildService({ findFirst: jest.fn().mockResolvedValue(null) });

    await service.remove('user-1', 'uuid-none');

    expect(client.savedAddress.delete).not.toHaveBeenCalled();
  });
});
import { createDraftsService } from './drafts.service';

const NOW = new Date('2026-11-12T10:00:00Z');

const electrical = { id: 'svc-1', slug: 'electrical', name: 'Electrical', icon: 'flash-outline' };
const plumbing = { id: 'svc-2', slug: 'plumbing', name: 'Plumbing', icon: 'water-outline' };

const unitSkill = {
  id: 'skill-hinge',
  serviceId: 'svc-1',
  slug: 'hinge-repair',
  name: 'Hinge repair',
  icon: null,
  basePricePaise: 3_000,
  pricingModel: 'PER_UNIT' as const,
  unitLabel: 'hinge',
  minQuantity: 1,
  maxQuantity: 10,
  minDurationMinutes: null,
  maxDurationMinutes: null,
  durationStepMinutes: null,
};

const bookingSkill = {
  id: 'skill-fan',
  serviceId: 'svc-1',
  slug: 'fan-installation',
  name: 'Fan installation',
  icon: null,
  basePricePaise: 15_000,
  pricingModel: 'PER_BOOKING' as const,
  unitLabel: null,
  minQuantity: 1,
  maxQuantity: 1,
  minDurationMinutes: null,
  maxDurationMinutes: null,
  durationStepMinutes: null,
};

const leakSkill = {
  id: 'skill-leak',
  serviceId: 'svc-2',
  slug: 'leak-repair',
  name: 'Leak repair',
  icon: null,
  basePricePaise: 20_000,
  pricingModel: 'PER_BOOKING' as const,
  unitLabel: null,
  minQuantity: 1,
  maxQuantity: 1,
  minDurationMinutes: null,
  maxDurationMinutes: null,
  durationStepMinutes: null,
};

const servicesBySlug = new Map([
  [electrical.slug, electrical],
  [plumbing.slug, plumbing],
]);

const allSkills = [unitSkill, bookingSkill, leakSkill];

function skillBySlug(slug: string) {
  return allSkills.find((skill) => skill.slug === slug);
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    customerId: 'cust-1',
    serviceId: 'svc-1',
    status: 'ACTIVE',
    description: 'Fix the door',
    imagePaths: ['jobs/user-1/photo.jpg'],
    estimatedTotalPaise: 21_000,
    convertedJobId: null,
    createdAt: NOW,
    updatedAt: NOW,
    service: electrical,
    items: [
      {
        id: 'item-1',
        sortOrder: 0,
        customSkill: null,
        pricingModel: 'PER_UNIT',
        unitPricePaise: 3_000,
        quantity: 2,
        unitLabel: 'hinge',
        durationMinutes: null,
        subtotalPaise: 6_000,
        skill: unitSkill,
      },
      {
        id: 'item-2',
        sortOrder: 1,
        customSkill: null,
        pricingModel: 'PER_BOOKING',
        unitPricePaise: 15_000,
        quantity: 1,
        unitLabel: null,
        durationMinutes: null,
        subtotalPaise: 15_000,
        skill: bookingSkill,
      },
    ],
    ...overrides,
  };
}

function plumbingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-2',
    customerId: 'cust-1',
    serviceId: 'svc-2',
    status: 'ACTIVE',
    description: 'Fix the door',
    imagePaths: ['jobs/user-1/photo.jpg'],
    estimatedTotalPaise: 20_000,
    convertedJobId: null,
    createdAt: NOW,
    updatedAt: new Date(NOW.getTime() + 1_000),
    service: plumbing,
    items: [
      {
        id: 'item-3',
        sortOrder: 0,
        customSkill: null,
        pricingModel: 'PER_BOOKING',
        unitPricePaise: 20_000,
        quantity: 1,
        unitLabel: null,
        durationMinutes: null,
        subtotalPaise: 20_000,
        skill: leakSkill,
      },
    ],
    ...overrides,
  };
}

/** The row a create/update would return for the service its payload names. */
function rowFromWriteData(data: {
  serviceId: string;
  description: string;
  imagePaths: string[];
  estimatedTotalPaise: number;
  items: { create: { sortOrder: number; skillId: string }[] };
}, id: string) {
  const base = data.serviceId === 'svc-2' ? plumbingRow() : draftRow();
  return {
    ...base,
    id,
    description: data.description,
    imagePaths: data.imagePaths,
    estimatedTotalPaise: data.estimatedTotalPaise,
    items: data.items.create.map((item, index) => ({
      id: `${id}-item-${index}`,
      sortOrder: item.sortOrder,
      customSkill: null,
      pricingModel: 'PER_BOOKING',
      unitPricePaise: 0,
      quantity: 1,
      unitLabel: null,
      durationMinutes: null,
      subtotalPaise: 0,
      skill: [...allSkills].find((skill) => skill.id === item.skillId) ?? unitSkill,
    })),
  };
}

function build(
  overrides: {
    customer?: Record<string, unknown> | null;
    service?: Record<string, unknown> | null;
    skills?: unknown[];
    active?: Record<string, unknown>[];
    transactionActive?: Record<string, unknown>[];
    createError?: unknown;
  } = {},
) {
  const customer =
    overrides.customer === undefined
      ? { id: 'cust-1', deletedAt: null, deletionRequestedAt: null }
      : overrides.customer;
  const active = overrides.active ?? [];

  const findMany = jest.fn().mockResolvedValue(active);

  const create = jest.fn().mockImplementation(async ({ data }: { data: never }) => {
    if (overrides.createError) throw overrides.createError;
    return rowFromWriteData(data, `draft-created-${create.mock.calls.length}`);
  });

  const update = jest.fn().mockImplementation(
    async ({ where, data }: { where: { id: string }; data: never }) =>
      rowFromWriteData(data, where.id),
  );
  const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });

  const txFindMany = jest
    .fn()
    .mockResolvedValue(
      overrides.transactionActive ??
        active.map((row) => ({ id: row.id, serviceId: row.serviceId })),
    );
  const tx = {
    bookingDraft: { findMany: txFindMany, update, updateMany, create },
    bookingDraftItem: { deleteMany },
  };

  const prisma = {
    customerProfile: { findUnique: jest.fn().mockResolvedValue(customer) },
    service: {
      findFirst: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { slug: string } }) =>
          overrides.service === undefined
            ? servicesBySlug.get(where.slug) ?? null
            : overrides.service,
        ),
    },
    skill: {
      findMany: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { slug: { in: string[] }; serviceId: string } }) =>
            (overrides.skills ??
              where.slug.in
                .map((slug) => skillBySlug(slug))
                .filter((skill) => skill?.serviceId === where.serviceId)) as unknown[],
        ),
    },
    bookingDraft: { findMany, create, update, updateMany },
    bookingDraftItem: { deleteMany },
    $transaction: jest.fn().mockImplementation(async (fn: (client: unknown) => unknown) => fn(tx)),
  };

  const storage = {
    jobImagePublicUrl: jest.fn().mockImplementation((path: string) => `https://cdn/${path}`),
  };

  const drafts = createDraftsService({ prisma: prisma as never, storage: storage as never });
  return {
    drafts,
    prisma,
    storage,
    findMany,
    txFindMany,
    create,
    update,
    deleteMany,
    updateMany,
  };
}

const oneGroup = {
  description: 'Fix the door',
  imagePaths: ['jobs/user-1/photo.jpg'],
  groups: [
    {
      serviceSlug: 'electrical',
      items: [
        { skillSlug: 'hinge-repair', quantity: 2 },
        { skillSlug: 'fan-installation', quantity: 1 },
      ],
    },
  ],
};

const twoGroups = {
  description: 'Fix the door',
  imagePaths: ['jobs/user-1/photo.jpg'],
  groups: [
    {
      serviceSlug: 'electrical',
      items: [{ skillSlug: 'hinge-repair', quantity: 2 }],
    },
    {
      serviceSlug: 'plumbing',
      items: [{ skillSlug: 'leak-repair', quantity: 1 }],
    },
  ],
};

describe('drafts service', () => {
  describe('getCurrent', () => {
    it('returns null when the caller has no customer profile yet', async () => {
      const ctx = build({ customer: null });
      await expect(ctx.drafts.getCurrent('user-1')).resolves.toBeNull();
      expect(ctx.prisma.bookingDraft.findMany).not.toHaveBeenCalled();
    });

    it('returns null when there is no active cart', async () => {
      const ctx = build({ active: [] });
      await expect(ctx.drafts.getCurrent('user-1')).resolves.toBeNull();
    });

    it('maps the active groups, including display URLs for their photos', async () => {
      const ctx = build({ active: [plumbingRow(), draftRow()] });

      const cart = await ctx.drafts.getCurrent('user-1');

      expect(cart).toMatchObject({
        description: 'Fix the door',
        imagePaths: ['jobs/user-1/photo.jpg'],
        imageUrls: ['https://cdn/jobs/user-1/photo.jpg'],
        estimatedTotalPaise: 41_000,
      });
      expect(cart?.groups).toHaveLength(2);
      expect(cart?.groups[0]).toMatchObject({
        service: { slug: 'plumbing' },
        estimatedTotalPaise: 20_000,
      });
      expect(cart?.groups[1]).toMatchObject({
        service: { slug: 'electrical' },
        estimatedTotalPaise: 21_000,
      });
      expect(cart?.groups[1]?.items).toHaveLength(2);
      expect(ctx.prisma.bookingDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'cust-1', status: 'ACTIVE' } }),
      );
    });
  });

  describe('saveCurrent', () => {
    it('prices every group from the catalogue and creates one row per service', async () => {
      const ctx = build({ active: [] });

      const cart = await ctx.drafts.saveCurrent('user-1', twoGroups);

      expect(cart?.groups).toHaveLength(2);
      expect(ctx.create).toHaveBeenCalledTimes(2);

      const first = ctx.create.mock.calls[0][0].data;
      expect(first.customerId).toBe('cust-1');
      expect(first.serviceId).toBe('svc-1');
      expect(first.estimatedTotalPaise).toBe(6_000);
      expect(first.items.create).toEqual([
        expect.objectContaining({
          sortOrder: 0,
          skillId: 'skill-hinge',
          quantity: 2,
          unitPricePaise: 3_000,
          subtotalPaise: 6_000,
        }),
      ]);

      const second = ctx.create.mock.calls[1][0].data;
      expect(second.serviceId).toBe('svc-2');
      expect(second.estimatedTotalPaise).toBe(20_000);
    });

    it('replaces an existing service row and abandons a service removed from the cart', async () => {
      const ctx = build({
        active: [draftRow({ id: 'draft-old' }), plumbingRow({ id: 'draft-plumbing' })],
      });

      await ctx.drafts.saveCurrent('user-1', oneGroup);

      expect(ctx.deleteMany).toHaveBeenCalledWith({ where: { draftId: 'draft-old' } });
      expect(ctx.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-old' } }),
      );
      expect(ctx.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['draft-plumbing'] } },
        data: { status: 'ABANDONED' },
      });
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('rejects a work that belongs to another service', async () => {
      const ctx = build();

      await expect(
        ctx.drafts.saveCurrent('user-1', {
          ...oneGroup,
          groups: [
            {
              serviceSlug: 'electrical',
              items: [{ skillSlug: 'leak-repair', quantity: 1 }],
            },
          ],
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'That job category does not belong to the chosen service.',
      });
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('rejects a photo from another customer’s folder', async () => {
      const ctx = build();

      await expect(
        ctx.drafts.saveCurrent('user-1', {
          ...oneGroup,
          imagePaths: ['jobs/user-2/photo.jpg'],
        }),
      ).rejects.toMatchObject({ status: 400, message: 'One of the photos is not valid.' });
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('rejects a cart for an account that is being deleted', async () => {
      const ctx = build({
        customer: { id: 'cust-1', deletedAt: null, deletionRequestedAt: NOW },
      });

      await expect(ctx.drafts.saveCurrent('user-1', oneGroup)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('rejects an inactive or unknown service', async () => {
      const ctx = build({ service: null });

      await expect(ctx.drafts.saveCurrent('user-1', oneGroup)).rejects.toMatchObject({
        status: 400,
        message: 'That service is no longer bookable.',
      });
    });

    it('requires custom text for the "other" work', async () => {
      const otherSkill = {
        ...bookingSkill,
        id: 'skill-other',
        slug: 'other',
        name: 'Other',
      };
      const ctx = build({ skills: [otherSkill] });

      await expect(
        ctx.drafts.saveCurrent('user-1', {
          ...oneGroup,
          groups: [
            {
              serviceSlug: 'electrical',
              items: [{ skillSlug: 'other', quantity: 1 }],
            },
          ],
        }),
      ).rejects.toMatchObject({ status: 400, message: 'Tell us what you need done.' });
    });

    it('clears the cart by abandoning every active group', async () => {
      const ctx = build({ active: [draftRow(), plumbingRow()] });

      await expect(
        ctx.drafts.saveCurrent('user-1', {
          description: '',
          imagePaths: [],
          groups: [],
        }),
      ).resolves.toBeNull();

      expect(ctx.updateMany).toHaveBeenCalledWith({
        where: { customerId: 'cust-1', status: 'ACTIVE' },
        data: { status: 'ABANDONED' },
      });
    });

    it('re-reads and replaces when a concurrent save won the create race', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      const ctx = build({ active: [], createError: uniqueError });
      ctx.txFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'draft-raced', serviceId: 'svc-1' }]);
      ctx.create.mockImplementationOnce(async () => {
        throw uniqueError;
      });
      ctx.create.mockImplementation(async ({ data }: { data: never }) =>
        rowFromWriteData(data, 'draft-raced'),
      );

      const cart = await ctx.drafts.saveCurrent('user-1', oneGroup);

      expect(cart?.groups[0]).toMatchObject({ id: 'draft-raced' });
      expect(ctx.txFindMany).toHaveBeenCalledTimes(2);
      expect(ctx.deleteMany).toHaveBeenCalledWith({ where: { draftId: 'draft-raced' } });
      expect(ctx.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-raced' } }),
      );
    });

    it('rethrows an unrelated write failure', async () => {
      const ctx = build({ createError: new Error('database is down') });

      await expect(ctx.drafts.saveCurrent('user-1', oneGroup)).rejects.toThrow(
        'database is down',
      );
    });
  });

  describe('clearCurrent', () => {
    it('abandons the caller’s active cart', async () => {
      const ctx = build();

      await ctx.drafts.clearCurrent('user-1');

      expect(ctx.updateMany).toHaveBeenCalledWith({
        where: { customerId: 'cust-1', status: 'ACTIVE' },
        data: { status: 'ABANDONED' },
      });
    });

    it('is a no-op when the profile does not exist yet', async () => {
      const ctx = build({ customer: null });

      await ctx.drafts.clearCurrent('user-1');

      expect(ctx.updateMany).not.toHaveBeenCalled();
    });
  });
});

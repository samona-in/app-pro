import type { BookingCart, ServiceOption } from '@samona/types';
import {
  cartItems,
  cartServiceCount,
  cartTotalPaise,
  cartUnitCount,
  cartWorksCount,
  groupItems,
  useBookingDraft,
  type DraftItem,
} from '../booking';

const electrical: ServiceOption = {
  id: 'svc-1',
  slug: 'electrical',
  name: 'Electrical',
  icon: 'flash-outline',
};

const plumbing: ServiceOption = {
  id: 'svc-2',
  slug: 'plumbing',
  name: 'Plumbing',
  icon: 'water-outline',
};

const hingeSkill = {
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

const fanSkill = {
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
  pricingModel: 'PER_HOUR' as const,
  unitLabel: null,
  minQuantity: 1,
  maxQuantity: 1,
  minDurationMinutes: 60,
  maxDurationMinutes: 480,
  durationStepMinutes: 30,
};

const savedCart: BookingCart = {
  description: 'Fix the door',
  imagePaths: ['jobs/user-1/photo.jpg'],
  imageUrls: ['https://cdn/jobs/user-1/photo.jpg'],
  estimatedTotalPaise: 26_000,
  updatedAt: '2026-11-12T10:00:00.000Z',
  groups: [
    {
      id: 'draft-1',
      service: electrical,
      estimatedTotalPaise: 6_000,
      updatedAt: '2026-11-12T10:00:00.000Z',
      items: [
        {
          id: 'item-1',
          sortOrder: 0,
          skill: hingeSkill,
          customSkill: null,
          pricingModel: 'PER_UNIT',
          unitPricePaise: 3_000,
          quantity: 2,
          unitLabel: 'hinge',
          durationMinutes: null,
          subtotalPaise: 6_000,
        },
      ],
    },
    {
      id: 'draft-2',
      service: plumbing,
      estimatedTotalPaise: 20_000,
      updatedAt: '2026-11-12T10:00:00.000Z',
      items: [
        {
          id: 'item-2',
          sortOrder: 0,
          skill: leakSkill,
          customSkill: null,
          pricingModel: 'PER_HOUR',
          unitPricePaise: 20_000,
          quantity: 1,
          unitLabel: null,
          durationMinutes: 60,
          subtotalPaise: 20_000,
        },
      ],
    },
  ],
};

const hingeItem: DraftItem = {
  skill: hingeSkill,
  customSkill: '',
  quantity: 2,
  durationMinutes: null,
  totalPaise: 6_000,
};

const fanItem: DraftItem = {
  skill: fanSkill,
  customSkill: '',
  quantity: 1,
  durationMinutes: null,
  totalPaise: 15_000,
};

const leakItem: DraftItem = {
  skill: leakSkill,
  customSkill: '',
  quantity: 1,
  durationMinutes: 60,
  totalPaise: 20_000,
};

describe('booking draft store', () => {
  beforeEach(() => {
    useBookingDraft.getState().reset();
  });

  it('restores every saved service group, its photos and totals', () => {
    useBookingDraft.getState().hydrate(savedCart);

    const state = useBookingDraft.getState();
    expect(state.service).toEqual(electrical);
    expect(state.description).toBe('Fix the door');
    expect(state.images).toEqual([
      {
        uri: 'https://cdn/jobs/user-1/photo.jpg',
        path: 'jobs/user-1/photo.jpg',
        uploading: false,
        failed: false,
      },
    ]);
    expect(state.groups).toHaveLength(2);
    expect(state.groups[0]).toMatchObject({
      service: electrical,
      items: [
        {
          skill: hingeSkill,
          customSkill: '',
          quantity: 2,
          durationMinutes: null,
          totalPaise: 6_000,
        },
      ],
    });
    expect(state.groups[1]).toMatchObject({
      service: plumbing,
      items: [{ skill: leakSkill, durationMinutes: 60, totalPaise: 20_000 }],
    });
    expect(state.preselectedSkillId).toBeNull();
  });

  it('opens another service without discarding the works already in the cart', () => {
    useBookingDraft.getState().start(electrical);
    useBookingDraft.getState().addItem(hingeItem);
    useBookingDraft.getState().setDescription('Fix the door');

    useBookingDraft.getState().start(plumbing);

    const state = useBookingDraft.getState();
    expect(state.service).toEqual(plumbing);
    expect(state.groups.map((group) => group.service)).toEqual([electrical]);
    expect(state.description).toBe('Fix the door');
  });

  it('adds works to the open service group and keeps other services untouched', () => {
    useBookingDraft.getState().start(electrical);
    useBookingDraft.getState().addItem(hingeItem);

    useBookingDraft.getState().start(plumbing);
    useBookingDraft.getState().addItem(leakItem);

    const groups = useBookingDraft.getState().groups;
    expect(groups).toHaveLength(2);
    expect(groupItems(groups, 'svc-1')).toHaveLength(1);
    expect(groupItems(groups, 'svc-2')).toHaveLength(1);
    expect(cartServiceCount(groups)).toBe(2);
    expect(cartWorksCount(groups)).toBe(2);
    expect(cartTotalPaise(groups)).toBe(26_000);
  });

  it('replaces an existing work in place instead of adding a duplicate', () => {
    useBookingDraft.getState().start(electrical);
    useBookingDraft.getState().addItem(hingeItem);
    useBookingDraft.getState().addItem({ ...hingeItem, quantity: 3, totalPaise: 9_000 });

    expect(useBookingDraft.getState().groups[0]?.items).toHaveLength(1);
    expect(useBookingDraft.getState().groups[0]?.items[0]?.quantity).toBe(3);
  });

  it('caps a service group at ten distinct works', () => {
    useBookingDraft.getState().start(electrical);
    for (let index = 0; index < 10; index += 1) {
      const added = useBookingDraft.getState().addItem({
        ...fanItem,
        skill: { ...fanSkill, id: `skill-${index}` },
      });
      expect(added).toBe(true);
    }

    const added = useBookingDraft.getState().addItem({
      ...fanItem,
      skill: { ...fanSkill, id: 'skill-11' },
    });

    expect(added).toBe(false);
    expect(useBookingDraft.getState().groups[0]?.items).toHaveLength(10);
  });

  it('caps the cart at five services', () => {
    for (let index = 0; index < 5; index += 1) {
      const service = { ...electrical, id: `svc-${index}`, slug: `service-${index}` };
      useBookingDraft.getState().start(service);
      expect(useBookingDraft.getState().addItem(hingeItem)).toBe(true);
    }

    useBookingDraft.getState().start({ ...electrical, id: 'svc-6', slug: 'service-6' });
    expect(useBookingDraft.getState().addItem(hingeItem)).toBe(false);
    expect(useBookingDraft.getState().groups).toHaveLength(5);
  });

  it('removes a work across groups and drops the group it emptied', () => {
    useBookingDraft.getState().hydrate(savedCart);

    useBookingDraft.getState().removeItem('skill-leak');

    const groups = useBookingDraft.getState().groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]?.service).toEqual(electrical);
  });

  it('re-estimates a work in its own group when its quantity changes', () => {
    useBookingDraft.getState().hydrate(savedCart);

    useBookingDraft.getState().setQuantity('skill-hinge', 3);

    const groups = useBookingDraft.getState().groups;
    expect(groupItems(groups, 'svc-1')[0]).toMatchObject({ quantity: 3, totalPaise: 9_000 });
    expect(groupItems(groups, 'svc-2')[0]).toMatchObject({ totalPaise: 20_000 });
    expect(cartTotalPaise(groups)).toBe(29_000);
  });

  it('re-estimates an hourly work when its duration changes', () => {
    useBookingDraft.getState().hydrate(savedCart);

    useBookingDraft.getState().setDurationMinutes('skill-leak', 90);

    expect(groupItems(useBookingDraft.getState().groups, 'svc-2')[0]).toMatchObject({
      durationMinutes: 90,
      totalPaise: 30_000,
    });
  });

  it('clears one service and leaves the rest of the cart', () => {
    useBookingDraft.getState().hydrate(savedCart);
    useBookingDraft.getState().start(plumbing);

    useBookingDraft.getState().clearService('svc-2');

    const state = useBookingDraft.getState();
    expect(state.groups.map((group) => group.service)).toEqual([electrical]);
    expect(state.service).toBeNull();
  });

  it('removes the services just checked out and leaves the rest of the cart', () => {
    useBookingDraft.getState().hydrate(savedCart);
    useBookingDraft.getState().start(plumbing);

    // The checkout covered plumbing only; electrical was deferred.
    useBookingDraft.getState().removeServices(['svc-2']);

    const state = useBookingDraft.getState();
    expect(state.groups.map((group) => group.service)).toEqual([electrical]);
    // The catalogue follows the remaining group instead of the removed one.
    expect(state.service).toEqual(electrical);
  });

  it('reset clears the open service and the whole cart', () => {
    useBookingDraft.getState().hydrate(savedCart);

    useBookingDraft.getState().reset();

    const state = useBookingDraft.getState();
    expect(state.service).toBeNull();
    expect(state.groups).toEqual([]);
    expect(state.images).toEqual([]);
    expect(state.description).toBe('');
  });

  it('summarizes the whole cart across services', () => {
    const groups = [
      { service: electrical, items: [hingeItem, fanItem] },
      { service: plumbing, items: [leakItem] },
    ];

    expect(cartItems(groups)).toHaveLength(3);
    expect(cartServiceCount(groups)).toBe(2);
    expect(cartWorksCount(groups)).toBe(3);
    // 2 hinges + 1 fan booking + 1 hourly work.
    expect(cartUnitCount(groups)).toBe(4);
    expect(cartTotalPaise(groups)).toBe(41_000);
  });
});

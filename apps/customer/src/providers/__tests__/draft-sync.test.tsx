import { act, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import type { BookingCart, ServiceOption } from '@samona/types';
import { draftsApi } from '@/services/drafts';
import { useBookingDraft, type DraftItem } from '@/stores/booking';
import { DraftSync } from '../draft-sync';

/**
 * The auth state the mocked provider reports. Tests flip it to simulate a
 * sign-out without standing up Supabase.
 */
let mockAuth: {
  isLoaded: boolean;
  isSignedIn: boolean;
  session: { user: { id: string } } | null;
  signOut: jest.Mock;
};

jest.mock('../auth-provider', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/services/drafts', () => ({
  draftsApi: {
    getCurrent: jest.fn(),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const getCurrent = draftsApi.getCurrent as jest.Mock;
const save = draftsApi.save as jest.Mock;
const clear = draftsApi.clear as jest.Mock;

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

const savedCart: BookingCart = {
  description: 'From the server',
  imagePaths: [],
  imageUrls: [],
  estimatedTotalPaise: 6_000,
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
  ],
};

const hingeItem: DraftItem = {
  skill: hingeSkill,
  customSkill: '',
  quantity: 2,
  durationMinutes: null,
  totalPaise: 6_000,
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

const leakItem: DraftItem = {
  skill: leakSkill,
  customSkill: '',
  quantity: 1,
  durationMinutes: 90,
  totalPaise: 30_000,
};

const appStateListeners: Array<(state: AppStateStatus) => void> = [];

/** Lets every pending promise in the sync settle. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

describe('DraftSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    appStateListeners.length = 0;
    useBookingDraft.getState().reset();

    mockAuth = {
      isLoaded: true,
      isSignedIn: true,
      session: { user: { id: 'user-1' } },
      signOut: jest.fn(),
    };

    getCurrent.mockResolvedValue(null);
    save.mockResolvedValue(null);
    clear.mockResolvedValue({ success: true });

    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: AppStateStatus) => void,
    ) => {
      appStateListeners.push(handler);
      return { remove: jest.fn() };
    }) as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('restores a saved cart when the local cart is empty', async () => {
    getCurrent.mockResolvedValue(savedCart);

    render(<DraftSync />);
    await flush();

    expect(useBookingDraft.getState().service?.slug).toBe('electrical');
    expect(useBookingDraft.getState().groups[0]?.items).toHaveLength(1);
    expect(useBookingDraft.getState().description).toBe('From the server');

    // Restoring is not an edit: no write-back.
    await advance(1_000);
    expect(save).not.toHaveBeenCalled();
  });

  it('never overwrites a cart the customer started first', async () => {
    useBookingDraft.getState().start(electrical);
    useBookingDraft.getState().addItem(hingeItem);
    getCurrent.mockResolvedValue(savedCart);

    render(<DraftSync />);
    await flush();

    const state = useBookingDraft.getState();
    expect(state.description).toBe('');
    expect(state.groups[0]?.items).toHaveLength(1);
  });

  it('writes edits back after the debounce', async () => {
    render(<DraftSync />);
    await flush();

    act(() => {
      useBookingDraft.getState().start(electrical);
      useBookingDraft.getState().addItem(hingeItem);
    });

    // Nothing is written before the debounce elapses.
    expect(save).not.toHaveBeenCalled();

    await advance(700);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '',
        imagePaths: [],
        groups: [
          expect.objectContaining({
            serviceSlug: 'electrical',
            items: [expect.objectContaining({ skillSlug: 'hinge-repair', quantity: 2 })],
          }),
        ],
      }),
    );
  });

  it('saves every service group in one cart payload', async () => {
    render(<DraftSync />);
    await flush();

    act(() => {
      useBookingDraft.getState().start(electrical);
      useBookingDraft.getState().addItem(hingeItem);
      useBookingDraft.getState().start(plumbing);
      useBookingDraft.getState().addItem(leakItem);
    });

    await advance(700);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          expect.objectContaining({
            serviceSlug: 'electrical',
            items: [expect.objectContaining({ skillSlug: 'hinge-repair', quantity: 2 })],
          }),
          expect.objectContaining({
            serviceSlug: 'plumbing',
            items: [
              expect.objectContaining({ skillSlug: 'leak-repair', durationMinutes: 90 }),
            ],
          }),
        ],
      }),
    );
  });

  it('abandons the saved cart when the last work is removed', async () => {
    render(<DraftSync />);
    await flush();

    act(() => {
      useBookingDraft.getState().start(electrical);
      useBookingDraft.getState().addItem(hingeItem);
    });
    await advance(700);
    expect(save).toHaveBeenCalledTimes(1);

    act(() => {
      useBookingDraft.getState().removeItem('skill-hinge');
    });
    await advance(700);

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately when the app is backgrounded', async () => {
    render(<DraftSync />);
    await flush();

    act(() => {
      useBookingDraft.getState().start(electrical);
      useBookingDraft.getState().addItem(hingeItem);
    });

    act(() => {
      appStateListeners.forEach((listener) => listener('background'));
    });
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('drops the local cart when the customer signs out', async () => {
    getCurrent.mockResolvedValue(savedCart);

    const { rerender } = render(<DraftSync />);
    await flush();
    expect(useBookingDraft.getState().service?.slug).toBe('electrical');

    mockAuth = { ...mockAuth, isSignedIn: false, session: null };
    rerender(<DraftSync />);
    await flush();

    expect(useBookingDraft.getState().service).toBeNull();
    expect(useBookingDraft.getState().groups).toEqual([]);
    // Signing out keeps the durable copy for the next sign-in.
    expect(clear).not.toHaveBeenCalled();
  });
});

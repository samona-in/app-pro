import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, BackHandler } from 'react-native';
import type * as ReactTypes from 'react';
import { JOB_ITEMS_LIMIT } from '@samona/types';
import type { ServiceOption, ServiceWithWorkGroups, SkillOption } from '@samona/types';
import type { BookingDetailsSelection } from '@/components/booking/BookingDetailsSheet';
import type { DraftItem } from '@/stores/booking';
import * as workGroupsScroll from '@/components/booking/work-groups-scroll';
import BookingSkill from '../booking/new/[slug]/skill';

const mockUseServiceCategories = jest.fn();
const mockUseServiceSkills = jest.fn();
const mockUseServiceWorkGroups = jest.fn();
const mockAddItem = jest.fn(() => true);
const mockSetDescription = jest.fn();
const mockStartBooking = jest.fn();
const mockSetQuantity = jest.fn();
const mockSetDurationMinutes = jest.fn();
const mockRemoveItem = jest.fn();
const mockDetailsSheetProps: {
  skillName?: string;
  pricing?: SkillOption | null;
  onAdd?: (description: string, selection: BookingDetailsSelection) => void;
  open?: boolean;
} = {};
/** The stack options the screen last handed to the navigator. */
const mockStackOptions: { gestureEnabled?: boolean } = {};
let mockDraftService: ServiceOption | null = null;
let mockDraftItems: DraftItem[] = [];

jest.mock('@/components/booking/BookingDetailsSheet', () => {
  const React = jest.requireActual<typeof ReactTypes>('react');

  return {
    BookingDetailsSheet: (props: {
      skillName: string;
      pricing?: SkillOption | null;
      onAdd: (description: string, selection: BookingDetailsSelection) => void;
    }) => {
      mockDetailsSheetProps.skillName = props.skillName;
      mockDetailsSheetProps.pricing = props.pricing;
      mockDetailsSheetProps.onAdd = props.onAdd;

      React.useEffect(() => {
        mockDetailsSheetProps.open = true;
        return () => {
          mockDetailsSheetProps.open = false;
        };
      }, []);

      return null;
    },
  };
});

jest.mock('@/hooks', () => ({
  useServiceCategories: (...args: unknown[]) => mockUseServiceCategories(...args),
  useServiceSkills: (...args: unknown[]) => mockUseServiceSkills(...args),
  useServiceWorkGroups: (...args: unknown[]) => mockUseServiceWorkGroups(...args),
}));

jest.mock('@/stores/booking', () => {
  // The cart arithmetic helpers stay real; only the store hook is replaced.
  const actual = jest.requireActual<typeof import('@/stores/booking')>('@/stores/booking');
  return {
    ...actual,
    useBookingDraft: () => ({
      service: mockDraftService,
      groups:
        mockDraftService && mockDraftItems.length > 0
          ? [{ service: mockDraftService, items: mockDraftItems }]
          : [],
      items: mockDraftItems,
      description: '',
      images: [],
      preselectedSkillId: null,
      start: mockStartBooking,
      addItem: mockAddItem,
      removeItem: mockRemoveItem,
      setQuantity: mockSetQuantity,
      setDurationMinutes: mockSetDurationMinutes,
      setDescription: mockSetDescription,
    }),
  };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'electrician' }),
  // The screen sets its own stack options (it disables the swipe-back while the
  // details sheet is open); the navigator is not mounted in these tests.
  Stack: {
    Screen: ({ options }: { options?: { gestureEnabled?: boolean } }) => {
      mockStackOptions.gestureEnabled = options?.gestureEnabled;
      return null;
    },
  },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockRouterPush = jest.requireMock('expo-router').router.push as jest.Mock;

const service: ServiceOption = {
  id: 'service-1',
  slug: 'electrician',
  name: 'Electrician',
  icon: null,
};

const fanRepair: SkillOption = {
  id: 'skill-fan-repair',
  serviceId: 'service-1',
  slug: 'fan-repair',
  name: 'Fan repair',
  icon: null,
  groupId: 'group-fans',
  basePricePaise: 50_000,
};

const fanInstallation: SkillOption = {
  id: 'skill-fan-installation',
  serviceId: 'service-1',
  slug: 'fan-installation',
  name: 'Fan installation',
  icon: null,
  groupId: 'group-fans',
  basePricePaise: 75_000,
};

const groupedCatalogue: ServiceWithWorkGroups = {
  service,
  groups: [
    {
      id: 'group-fans',
      serviceId: 'service-1',
      name: 'Fans',
      slug: 'fans',
      imageUrl: 'asset://service-work-groups/fan',
      sortOrder: 1,
      isActive: true,
      works: [fanRepair, fanInstallation],
    },
  ],
};

/** A work as it sits in the cart, with its estimated total. */
function cartedItem(skill: SkillOption, overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    skill,
    customSkill: '',
    quantity: 1,
    durationMinutes: null,
    totalPaise: skill.basePricePaise ?? 0,
    ...overrides,
  };
}

function queryResult<T>(data: T | undefined, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isError: false,
    isSuccess: data !== undefined,
    refetch: jest.fn(),
    ...overrides,
  };
}

function useDefaultCatalogue() {
  mockUseServiceCategories.mockReturnValue(queryResult([service]));
  mockUseServiceSkills.mockReturnValue(queryResult([fanRepair, fanInstallation]));
  mockUseServiceWorkGroups.mockReturnValue(queryResult(groupedCatalogue));
}

describe('customer service work groups screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraftService = null;
    mockDraftItems = [];
    delete mockDetailsSheetProps.skillName;
    delete mockDetailsSheetProps.pricing;
    delete mockDetailsSheetProps.onAdd;
    useDefaultCatalogue();
  });

  it('initializes the booking draft service when opened directly', () => {
    render(<BookingSkill />);

    expect(mockStartBooking).toHaveBeenCalledWith(service);
  });

  it('replaces a stale draft service with the service in the route', () => {
    mockDraftService = {
      id: 'service-old',
      slug: 'plumber',
      name: 'Plumber',
      icon: null,
    };

    render(<BookingSkill />);

    expect(mockStartBooking).toHaveBeenCalledWith(service);
  });

  it('renders group headings and each work once, then opens the details sheet', () => {
    const { getByLabelText, getAllByText } = render(<BookingSkill />);

    expect(getAllByText('Fans')).toHaveLength(2); // category card and section heading
    expect(getAllByText('Fan repair')).toHaveLength(1);
    expect(getAllByText('Fan installation')).toHaveLength(1);

    fireEvent.press(getByLabelText('Fan repair'));

    // The work opens in the details sheet; booking it happens through the
    // sheet's Add button, not by leaving the catalogue.
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockDetailsSheetProps.skillName).toBe('Fan repair');
    expect(mockDetailsSheetProps.pricing).toEqual(fanRepair);
  });

  it('scrolls the catalogue to a tapped group with its name visible, without leaving the screen', () => {
    const lightInstallation: SkillOption = {
      id: 'skill-light-installation',
      serviceId: 'service-1',
      slug: 'light-installation',
      name: 'Light installation',
      icon: null,
      groupId: 'group-lights',
      basePricePaise: 40_000,
    };
    mockUseServiceSkills.mockReturnValue(
      queryResult([fanRepair, fanInstallation, lightInstallation]),
    );
    mockUseServiceWorkGroups.mockReturnValue(
      queryResult({
        service,
        groups: [
          ...groupedCatalogue.groups,
          {
            id: 'group-lights',
            serviceId: 'service-1',
            name: 'Lights',
            slug: 'lights',
            imageUrl: 'asset://service-work-groups/light',
            sortOrder: 2,
            isActive: true,
            works: [lightInstallation],
          },
        ],
      } satisfies ServiceWithWorkGroups),
    );

    const scrollToWorkGroup = jest.spyOn(workGroupsScroll, 'scrollToWorkGroup');

    try {
      const { getByLabelText, getAllByTestId } = render(<BookingSkill />);

      // Lay the catalogue out: the sections list sits below the hero and the
      // group grid, and each group's section gets its own offset — a
      // single-work group jumps to its section start just like a many-work
      // group, so its name leads its rows below the pinned header.
      const fireEventLayout = (testID: string, y: number) => {
        const [anchor] = getAllByTestId(testID);
        if (!anchor) throw new Error(`Missing catalogue anchor: ${testID}`);
        fireEvent(anchor, 'layout', {
          nativeEvent: { layout: { x: 0, y, width: 320, height: 400 } },
        });
      };
      fireEventLayout('work-group-sections', 304);
      fireEventLayout('work-group-section-group-fans', 0);
      fireEventLayout('work-group-section-group-lights', 560);

      fireEvent.press(getByLabelText('Lights'));

      expect(scrollToWorkGroup).toHaveBeenCalledWith(expect.anything(), {
        sectionsTop: 304,
        sectionTop: 560,
      });
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockDetailsSheetProps.skillName).toBeUndefined();
    } finally {
      scrollToWorkGroup.mockRestore();
    }
  });

  it('waits for the catalogue to lay out before it can jump to a group', () => {
    const scrollToWorkGroup = jest.spyOn(workGroupsScroll, 'scrollToWorkGroup');

    try {
      const { getByLabelText } = render(<BookingSkill />);

      fireEvent.press(getByLabelText('Fans'));

      expect(scrollToWorkGroup).not.toHaveBeenCalled();
    } finally {
      scrollToWorkGroup.mockRestore();
    }
  });

  it('locks the swipe-back gesture while the details sheet is open', () => {
    const { getByLabelText } = render(<BookingSkill />);

    expect(mockStackOptions.gestureEnabled).toBe(true);

    fireEvent.press(getByLabelText('Fan repair'));

    // The native edge-swipe must not pop the screen out from under the sheet.
    expect(mockStackOptions.gestureEnabled).toBe(false);
  });

  it('dismisses the details sheet on back instead of leaving the catalogue', () => {
    const handlers: (() => boolean)[] = [];
    const addListener = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        handlers.push(handler as () => boolean);
        return { remove: jest.fn() };
      });

    try {
      const { getByLabelText } = render(<BookingSkill />);

      fireEvent.press(getByLabelText('Fan repair'));
      expect(mockDetailsSheetProps.open).toBe(true);
      expect(handlers).toHaveLength(1);

      let handled = false;
      act(() => {
        handled = handlers[0]?.() ?? false;
      });

      // The press is consumed by the screen, the sheet closes, and the
      // catalogue stays put.
      expect(handled).toBe(true);
      expect(mockDetailsSheetProps.open).toBe(false);
      expect(mockStackOptions.gestureEnabled).toBe(true);
      expect(mockRouterPush).not.toHaveBeenCalled();
    } finally {
      addListener.mockRestore();
    }
  });

  it('adds the work to the cart from the details sheet and returns to the catalogue', () => {
    const { getByLabelText } = render(<BookingSkill />);

    fireEvent.press(getByLabelText('Fan repair'));
    act(() => {
      mockDetailsSheetProps.onAdd?.('A ceiling fan hums and wobbles.', {
        quantity: 2,
        durationMinutes: null,
        totalPaise: 100_000,
      });
    });

    // The work lands in the cart with the sheet's selection; the catalogue
    // stays on screen so the customer can add more works.
    expect(mockAddItem).toHaveBeenCalledWith({
      skill: fanRepair,
      customSkill: '',
      quantity: 2,
      durationMinutes: null,
      totalPaise: 100_000,
    });
    expect(mockSetDescription).toHaveBeenCalledWith('A ceiling fan hums and wobbles.');
    expect(mockDetailsSheetProps.open).toBe(false);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('warns and keeps the sheet open when the cart is already full', () => {
    mockAddItem.mockReturnValueOnce(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    try {
      const { getByLabelText } = render(<BookingSkill />);

      fireEvent.press(getByLabelText('Fan repair'));
      expect(mockDetailsSheetProps.open).toBe(true);

      act(() => {
        mockDetailsSheetProps.onAdd?.('A ceiling fan hums and wobbles.', {
          quantity: 1,
          durationMinutes: null,
          totalPaise: 50_000,
        });
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Cart is full',
        `You can book up to ${JOB_ITEMS_LIMIT} works in one request. Remove one to add another.`,
      );
      // The rejected work stays in the sheet, not in the cart.
      expect(mockSetDescription).not.toHaveBeenCalled();
      expect(mockDetailsSheetProps.open).toBe(true);
    } finally {
      alertSpy.mockRestore();
    }
  });

  it('pins the cart summary while the catalogue scrolls and continues to the cart', () => {
    mockDraftService = service;
    mockDraftItems = [
      cartedItem(fanRepair, { quantity: 2, totalPaise: 100_000 }),
      cartedItem(fanInstallation),
    ];

    const { getByLabelText, getByText, getAllByText, queryAllByText } = render(<BookingSkill />);

    // Works already in the cart read as added rather than bookable.
    expect(getAllByText('Added')).toHaveLength(2);
    expect(queryAllByText('Book now')).toHaveLength(0);

    // The summary carries the whole visit: 2 works, 3 units, one estimate.
    expect(getByText('2 works · 3 items')).toBeTruthy();
    expect(getByText('Estimated total ₹1,750')).toBeTruthy();

    fireEvent.press(getByLabelText('View cart with 2 works in cart'));

    expect(mockRouterPush).toHaveBeenCalledWith('/booking/cart');
  });

  it('turns an added work into a working quantity stepper', () => {
    const switchRepair: SkillOption = {
      id: 'skill-switch-repair',
      serviceId: 'service-1',
      slug: 'switch-repair',
      name: 'Switch repair',
      icon: null,
      groupId: 'group-fans',
      pricingModel: 'PER_UNIT',
      basePricePaise: 15_000,
      unitLabel: 'switch',
      minQuantity: 1,
      maxQuantity: 5,
    };
    mockUseServiceSkills.mockReturnValue(queryResult([switchRepair, fanInstallation]));
    mockUseServiceWorkGroups.mockReturnValue(
      queryResult({
        service,
        groups: [{ ...groupedCatalogue.groups[0], works: [switchRepair, fanInstallation] }],
      }),
    );
    mockDraftService = service;
    mockDraftItems = [cartedItem(switchRepair, { quantity: 2, totalPaise: 30_000 })];

    const { getByLabelText, queryByText } = render(<BookingSkill />);

    // The pill no longer just says "Added": it is the real quantity control.
    expect(queryByText('Added')).toBeNull();
    expect(getByLabelText('Switch repair quantity 2')).toBeTruthy();

    fireEvent.press(getByLabelText('Increase quantity of Switch repair'));
    expect(mockSetQuantity).toHaveBeenCalledWith('skill-switch-repair', 3);

    fireEvent.press(getByLabelText('Reduce quantity of Switch repair'));
    expect(mockSetQuantity).toHaveBeenCalledWith('skill-switch-repair', 1);
  });

  it('drops a work out of the cart when its quantity goes below the minimum', () => {
    const switchRepair: SkillOption = {
      id: 'skill-switch-repair',
      serviceId: 'service-1',
      slug: 'switch-repair',
      name: 'Switch repair',
      icon: null,
      groupId: 'group-fans',
      pricingModel: 'PER_UNIT',
      basePricePaise: 15_000,
      unitLabel: 'switch',
      minQuantity: 1,
      maxQuantity: 5,
    };
    mockUseServiceSkills.mockReturnValue(queryResult([switchRepair]));
    mockUseServiceWorkGroups.mockReturnValue(
      queryResult({
        service,
        groups: [{ ...groupedCatalogue.groups[0], works: [switchRepair] }],
      }),
    );
    mockDraftService = service;
    mockDraftItems = [cartedItem(switchRepair, { quantity: 1, totalPaise: 15_000 })];

    const { getByLabelText } = render(<BookingSkill />);

    fireEvent.press(getByLabelText('Reduce quantity of Switch repair'));

    // The smallest quantity minus one removes the work instead of clamping it.
    expect(mockRemoveItem).toHaveBeenCalledWith('skill-switch-repair');
    expect(mockSetQuantity).not.toHaveBeenCalled();
  });

  it('steps an hourly work by its duration from the catalogue', () => {
    const hourlyInstallation: SkillOption = {
      ...fanInstallation,
      pricingModel: 'PER_HOUR',
      basePricePaise: 30_000,
      minDurationMinutes: 60,
      maxDurationMinutes: 240,
      durationStepMinutes: 30,
    };
    mockUseServiceSkills.mockReturnValue(queryResult([hourlyInstallation]));
    mockUseServiceWorkGroups.mockReturnValue(
      queryResult({
        service,
        groups: [{ ...groupedCatalogue.groups[0], works: [hourlyInstallation] }],
      }),
    );
    mockDraftService = service;
    mockDraftItems = [cartedItem(hourlyInstallation, { durationMinutes: 60, totalPaise: 30_000 })];

    const { getByLabelText } = render(<BookingSkill />);

    expect(getByLabelText('Fan installation duration 1 hr')).toBeTruthy();

    fireEvent.press(getByLabelText('Increase duration of Fan installation'));
    expect(mockSetDurationMinutes).toHaveBeenCalledWith('skill-fan-installation', 90);

    // At the shortest duration the minus removes the work.
    fireEvent.press(getByLabelText('Reduce duration of Fan installation'));
    expect(mockRemoveItem).toHaveBeenCalledWith('skill-fan-installation');
  });

  it('hides the cart summary while the cart is empty', () => {
    const { queryByLabelText } = render(<BookingSkill />);

    expect(queryByLabelText('View cart with 1 work in cart')).toBeNull();
    expect(queryByLabelText('View cart with 2 works in cart')).toBeNull();
  });

  it('keeps works from another service when the catalogue opens a new one', () => {
    const plumber: ServiceOption = {
      id: 'service-old',
      slug: 'plumber',
      name: 'Plumber',
      icon: null,
    };
    mockDraftService = plumber;
    mockDraftItems = [cartedItem(fanRepair)];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    try {
      render(<BookingSkill />);

      // One checkout may hold several services, so opening this catalogue
      // simply switches which group is edited — the other service's cart stays.
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockStartBooking).toHaveBeenCalledWith(service);
    } finally {
      alertSpy.mockRestore();
    }
  });

  it('falls back to the existing flat work list when the groups API is unavailable', () => {
    mockUseServiceWorkGroups.mockReturnValue(
      queryResult(undefined, { isError: true, isSuccess: false }),
    );

    const { getByLabelText, queryByLabelText } = render(<BookingSkill />);

    expect(getByLabelText('Fan repair')).toBeTruthy();
    expect(queryByLabelText('Fans, 2 works')).toBeNull();
  });

  it('waits for service details before showing works from the flat fallback', () => {
    mockUseServiceCategories.mockReturnValue(
      queryResult(undefined, { isPending: true, isSuccess: false }),
    );
    mockUseServiceWorkGroups.mockReturnValue(
      queryResult(undefined, { isError: true, isSuccess: false }),
    );

    const { getByText, queryByLabelText } = render(<BookingSkill />);

    expect(getByText('Loading job categories')).toBeTruthy();
    expect(queryByLabelText('Fan repair')).toBeNull();
  });

  it('shows loading, error, and empty states', () => {
    mockUseServiceSkills.mockReturnValue(queryResult(undefined, { isPending: true }));
    mockUseServiceWorkGroups.mockReturnValue(queryResult(undefined, { isPending: true }));
    expect(render(<BookingSkill />).getByText('Loading job categories')).toBeTruthy();

    mockUseServiceSkills.mockReturnValue(queryResult(undefined, { isError: true }));
    mockUseServiceWorkGroups.mockReturnValue(queryResult(undefined, { isError: true }));
    expect(render(<BookingSkill />).getByText("Couldn't load job categories")).toBeTruthy();

    mockUseServiceSkills.mockReturnValue(queryResult([]));
    mockUseServiceWorkGroups.mockReturnValue(
      queryResult({ service, groups: [] } satisfies ServiceWithWorkGroups),
    );
    expect(render(<BookingSkill />).getByText('Work types coming soon')).toBeTruthy();
  });
});

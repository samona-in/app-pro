import { act, fireEvent, render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import type * as ReactTypes from 'react';
import type { ServiceOption, ServiceWithWorkGroups, SkillOption } from '@samona/types';
import * as workGroupsScroll from '@/components/booking/work-groups-scroll';
import BookingSkill from '../booking/new/[slug]/skill';

const mockUseServiceCategories = jest.fn();
const mockUseServiceSkills = jest.fn();
const mockUseServiceWorkGroups = jest.fn();
const mockSetSkill = jest.fn();
const mockSetDescription = jest.fn();
const mockSetPricing = jest.fn();
const mockStartBooking = jest.fn();
const mockDetailsSheetProps: {
  skillName?: string;
  pricing?: SkillOption | null;
  onContinue?: (description: string) => void;
  open?: boolean;
} = {};
/** The stack options the screen last handed to the navigator. */
const mockStackOptions: { gestureEnabled?: boolean } = {};
let mockDraftService: ServiceOption | null = null;

jest.mock('@/components/booking/BookingDetailsSheet', () => {
  const React = jest.requireActual<typeof ReactTypes>('react');

  return {
    BookingDetailsSheet: (props: {
      skillName: string;
      pricing?: SkillOption | null;
      onContinue: (description: string) => void;
    }) => {
      mockDetailsSheetProps.skillName = props.skillName;
      mockDetailsSheetProps.pricing = props.pricing;
      mockDetailsSheetProps.onContinue = props.onContinue;

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

jest.mock('@/stores/booking', () => ({
  useBookingDraft: () => ({
    service: mockDraftService,
    skill: null,
    customSkill: '',
    start: mockStartBooking,
    setSkill: mockSetSkill,
    setDescription: mockSetDescription,
    setPricing: mockSetPricing,
  }),
}));

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
    delete mockDetailsSheetProps.skillName;
    delete mockDetailsSheetProps.pricing;
    delete mockDetailsSheetProps.onContinue;
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

    expect(mockSetSkill).toHaveBeenCalledWith(fanRepair);
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

  it('continues from the details sheet to the order preview', () => {
    const { getByLabelText } = render(<BookingSkill />);

    fireEvent.press(getByLabelText('Fan repair'));
    act(() => {
      mockDetailsSheetProps.onContinue?.('A leaking tap under the sink.');
    });

    expect(mockSetDescription).toHaveBeenCalledWith('A leaking tap under the sink.');
    expect(mockRouterPush).toHaveBeenCalledWith('/booking/new/electrician/review');
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

import { fireEvent, render } from '@testing-library/react-native';
import type { ServiceOption, ServiceWithWorkGroups, SkillOption } from '@samona/types';
import BookingSkill from '../booking/new/[slug]/skill';

const mockUseServiceCategories = jest.fn();
const mockUseServiceSkills = jest.fn();
const mockUseServiceWorkGroups = jest.fn();
const mockSetSkill = jest.fn();
const mockStartBooking = jest.fn();
let mockDraftService: ServiceOption | null = null;

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
  }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'electrician' }),
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
};

const fanInstallation: SkillOption = {
  id: 'skill-fan-installation',
  serviceId: 'service-1',
  slug: 'fan-installation',
  name: 'Fan installation',
  icon: null,
  groupId: 'group-fans',
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

  it('renders group headings and each work once, then preserves the booking flow', () => {
    const { getByLabelText, getAllByText } = render(<BookingSkill />);

    expect(getAllByText('Fans')).toHaveLength(2); // category card and section heading
    expect(getAllByText('Fan repair')).toHaveLength(1);
    expect(getAllByText('Fan installation')).toHaveLength(1);

    fireEvent.press(getByLabelText('Fan repair'));

    expect(mockSetSkill).toHaveBeenCalledWith(fanRepair);
    expect(mockRouterPush).toHaveBeenCalledWith('/booking/new/electrician/details');
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

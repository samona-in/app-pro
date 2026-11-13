import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { JobStatus, type JobDetail } from '@samona/types';
import Bookings from '../(tabs)/bookings';

const mockBookings: JobDetail[] = [
  {
    id: 'job-1',
    customerId: 'c1',
    proId: 'p1',
    service: { id: 's1', slug: 'ac-appliances', name: 'AC & Appliances', icon: null },
    skill: { id: 'sk1', slug: 'ac-repair', name: 'AC Repair', icon: null },
    customSkill: null,
    orderType: 'SINGLE',
    orderGroupId: null,
    items: [
      {
        id: 'job-1-item-1',
        sortOrder: 0,
        skill: { id: 'sk1', slug: 'ac-repair', name: 'AC Repair', icon: null },
        customSkill: null,
        pricingModel: 'PER_BOOKING',
        unitPricePaise: 79_900,
        quantity: 1,
        unitLabel: null,
        durationMinutes: null,
        subtotalPaise: 79_900,
      },
    ],
    status: JobStatus.TRAVELLING,
    locationLabel: 'Koramangala, Bengaluru',
    latitude: null,
    longitude: null,
    description: 'AC not cooling in the bedroom',
    imageUrls: [],
    basePayPaise: 79_900,
    pricingModel: 'PER_BOOKING',
    unitPricePaise: 79_900,
    quantity: 1,
    unitLabel: null,
    durationMinutes: null,
    agreedPayPaise: null,
    finalPayPaise: null,
    expiresAt: null,
    createdAt: '2026-10-22T04:10:00.000Z',
    updatedAt: '2026-10-22T04:30:00.000Z',
    distanceKm: 2.4,
    estimatedEtaMinutes: 12,
    verificationOtp: null,
    customer: {
      userId: 'c1',
      displayName: 'Ananya Rao',
      locationLabel: 'Koramangala, Bengaluru',
      phone: null,
    },
    pro: {
      proId: 'p1',
      displayName: 'Ravi Kumar',
      rating: 4.8,
      phone: null,
      photoUrl: null,
      isDeleted: false,
    },
    acceptedAt: '2026-10-22T04:20:00.000Z',
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
  },
  {
    id: 'job-2',
    customerId: 'c1',
    proId: 'p2',
    service: { id: 's2', slug: 'plumbing', name: 'Plumbing', icon: null },
    skill: { id: 'sk2', slug: 'leak-repair', name: 'Leak repair', icon: null },
    customSkill: null,
    orderType: 'SINGLE',
    orderGroupId: null,
    items: [
      {
        id: 'job-2-item-1',
        sortOrder: 0,
        skill: { id: 'sk2', slug: 'leak-repair', name: 'Leak repair', icon: null },
        customSkill: null,
        pricingModel: 'PER_BOOKING',
        unitPricePaise: 64_900,
        quantity: 1,
        unitLabel: null,
        durationMinutes: null,
        subtotalPaise: 64_900,
      },
    ],
    status: JobStatus.PAID,
    locationLabel: 'Indiranagar, Bengaluru',
    latitude: null,
    longitude: null,
    description: 'Leak under the kitchen sink',
    imageUrls: [],
    basePayPaise: 64_900,
    pricingModel: 'PER_BOOKING',
    unitPricePaise: 64_900,
    quantity: 1,
    unitLabel: null,
    durationMinutes: null,
    agreedPayPaise: 70_000,
    finalPayPaise: 70_000,
    expiresAt: null,
    createdAt: '2026-10-18T06:00:00.000Z',
    updatedAt: '2026-10-18T09:00:00.000Z',
    distanceKm: null,
    estimatedEtaMinutes: null,
    verificationOtp: null,
    customer: {
      userId: 'c1',
      displayName: 'Ananya Rao',
      locationLabel: 'Indiranagar, Bengaluru',
      phone: null,
    },
    pro: {
      proId: 'p2',
      displayName: 'Amit Sharma',
      rating: 4.9,
      phone: null,
      photoUrl: null,
      isDeleted: false,
    },
    acceptedAt: '2026-10-18T06:10:00.000Z',
    completedAt: '2026-10-18T08:00:00.000Z',
    cancelledAt: null,
    cancelledBy: null,
  },
  {
    id: 'job-3',
    customerId: 'c1',
    proId: null,
    service: { id: 's2', slug: 'plumbing', name: 'Plumbing', icon: null },
    skill: { id: 'sk2', slug: 'leak-repair', name: 'Leak repair', icon: null },
    customSkill: null,
    orderType: 'BULK',
    orderGroupId: null,
    items: [
      {
        id: 'job-3-item-1',
        sortOrder: 0,
        skill: { id: 'sk2', slug: 'leak-repair', name: 'Leak repair', icon: null },
        customSkill: null,
        pricingModel: 'PER_UNIT',
        unitPricePaise: 24_900,
        quantity: 2,
        unitLabel: 'tap',
        durationMinutes: null,
        subtotalPaise: 49_800,
      },
      {
        id: 'job-3-item-2',
        sortOrder: 1,
        skill: { id: 'sk3', slug: 'drain-cleaning', name: 'Drain cleaning', icon: null },
        customSkill: null,
        pricingModel: 'PER_BOOKING',
        unitPricePaise: 44_900,
        quantity: 1,
        unitLabel: null,
        durationMinutes: null,
        subtotalPaise: 44_900,
      },
    ],
    status: JobStatus.REQUESTED,
    locationLabel: 'Indiranagar, Bengaluru',
    latitude: null,
    longitude: null,
    description: '',
    imageUrls: [],
    basePayPaise: 94_700,
    pricingModel: 'PER_UNIT',
    unitPricePaise: 24_900,
    quantity: 2,
    unitLabel: 'tap',
    durationMinutes: null,
    agreedPayPaise: null,
    finalPayPaise: null,
    expiresAt: null,
    createdAt: '2026-11-10T05:00:00.000Z',
    updatedAt: '2026-11-10T05:00:00.000Z',
    distanceKm: null,
    estimatedEtaMinutes: null,
    verificationOtp: null,
    customer: null,
    pro: null,
    acceptedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
  },
];

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// The booking barrel reaches the pro tracking detail components, which need
// native maps and the realtime socket; the bookings list never renders them.
jest.mock('@/components/booking/detail', () => ({
  BookingStatusHero: () => null,
  ProfessionalTrackingMap: () => null,
  ProfessionalCard: () => null,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

// The bookings hook would reach the API, which needs a configured env.
jest.mock('@/hooks', () => ({
  useBookings: () => ({
    data: mockBookings,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useUnreadMessages: () => ({ countFor: () => 0 }),
}));

// The chat barrel pulls in the message components; the badge is inert here.
jest.mock('@/components/chat', () => ({ UnreadBadge: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

describe('Bookings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('summarises the bookings under the title', () => {
    render(<Bookings />);

    expect(screen.getByText('Bookings')).toBeTruthy();
    expect(screen.getByText('3 bookings · 2 active')).toBeTruthy();
  });

  it('offers four segments: All, Active, Upcoming and Past', () => {
    render(<Bookings />);

    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Past')).toBeTruthy();
    // The old five-chip filter is gone.
    expect(screen.queryByText('Cancelled')).toBeNull();
  });

  it('shows each booking as a quiet row with the price and the status', () => {
    render(<Bookings />);

    // The skill is what was booked; the service it sits under follows.
    expect(screen.getByText('AC Repair')).toBeTruthy();
    expect(screen.getByText(/AC & Appliances · /)).toBeTruthy();

    // The amount, and the state of the job.
    expect(screen.getByText('₹799')).toBeTruthy();
    expect(screen.getByText('On the way')).toBeTruthy();

    // The paid booking shows the amount actually paid.
    expect(screen.getByText('₹700')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();

    // The old row's free-text description line is gone.
    expect(screen.queryByText('AC not cooling in the bedroom')).toBeNull();
  });

  it('summarises a bulk booking as its works and carries the summed amount', () => {
    render(<Bookings />);

    // Two distinct works read as the first plus a count, not just the first.
    expect(screen.getByText('Leak repair + 1 more work')).toBeTruthy();

    // The row's second line carries the works and units breakdown.
    expect(screen.getByText(/Plumbing · .* · 2 works · 3 items/)).toBeTruthy();

    // The amount is the sum of every work's subtotal.
    expect(screen.getByText('₹947')).toBeTruthy();
    expect(screen.getByText('Requested')).toBeTruthy();
  });

  it('opens the booking a row is tapped from', () => {
    render(<Bookings />);

    fireEvent.press(screen.getByLabelText('AC Repair booking, On the way'));

    expect(router.push).toHaveBeenCalledWith('/booking/job-1');
  });

  it('filters the list down to the segment that is selected', () => {
    render(<Bookings />);

    fireEvent.press(screen.getByText('Past'));

    expect(screen.queryByText('AC Repair')).toBeNull();
    expect(screen.getByText('Leak repair')).toBeTruthy();
  });
});

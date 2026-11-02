import { fireEvent, render } from '@testing-library/react-native';
import type { ProServiceListItem } from '@samona/types';
import '@/i18n';
import ManageServicesScreen from '../manage-services';

// The ui barrel re-exports these two, which pull in reanimated/worklets native
// modules that are unavailable under Jest. Stub them so the barrel loads.
jest.mock('@/components/ui/ServiceRadiusSlider', () => ({ ServiceRadiusSlider: () => null }));
jest.mock('@/components/ui/SwipeToConfirm', () => ({ SwipeToConfirm: () => null }));

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// The sheet mounts a native bottom sheet; it is not what this test renders.
jest.mock('@/components/services/RejectionReasonSheet', () => ({
  RejectionReasonSheet: () => null,
}));

jest.mock('@/components/services/ServiceImage', () => ({
  isImageUrl: (value: string) => value.startsWith('http'),
  ServiceImage: () => null,
}));

const mockRequestMutate = jest.fn();

jest.mock('@/hooks', () => ({
  useProServices: () => ({
    data: mockServices,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useRequestProService: () => ({
    mutate: mockRequestMutate,
    isPending: false,
    variables: undefined,
  }),
}));

const mockServices: ProServiceListItem[] = [
  {
    id: 'svc-1',
    slug: 'plumbing',
    name: 'Plumbing',
    icon: 'https://cdn.test/services/plumbing.png',
    status: null,
    rejectionReason: null,
    skills: [
      {
        id: 'skl-1',
        name: 'Leak repair',
        icon: 'https://cdn.test/skills/leak.png',
        basePricePaise: 24_900,
      },
      {
        id: 'skl-2',
        name: 'Tap fitting',
        icon: 'tap-outline',
        basePricePaise: 1_25_000,
      },
    ],
  },
  {
    id: 'svc-2',
    slug: 'electrical',
    name: 'Electrical',
    icon: 'flash-outline',
    status: null,
    rejectionReason: null,
    skills: [
      {
        id: 'skl-3',
        name: 'Fan installation',
        icon: 'https://cdn.test/skills/fan.png',
        basePricePaise: 39_900,
      },
    ],
  },
];

describe('ManageServices accordion', () => {
  it('reveals a service’s specialties with name and base price when expanded', () => {
    const { getByLabelText, getByText, queryByText } = render(<ManageServicesScreen />);

    // Collapsed to start with: only the service names are on screen.
    expect(queryByText('Leak repair')).toBeNull();
    expect(queryByText('Fan installation')).toBeNull();

    fireEvent.press(getByLabelText('Plumbing, Not requested'));

    expect(getByText('Leak repair')).toBeTruthy();
    expect(getByText('₹249')).toBeTruthy();
    expect(getByText('Tap fitting')).toBeTruthy();
    expect(getByText('₹1,250')).toBeTruthy();
  });

  it('keeps at most one service expanded at a time', () => {
    const { getByLabelText, getByText, queryByText } = render(<ManageServicesScreen />);

    fireEvent.press(getByLabelText('Plumbing, Not requested'));
    expect(getByText('Leak repair')).toBeTruthy();

    fireEvent.press(getByLabelText('Electrical, Not requested'));
    expect(getByText('Fan installation')).toBeTruthy();
    // The first service's specialties collapsed as the second opened.
    expect(queryByText('Leak repair')).toBeNull();
  });

  it('collapses the open service when its header is pressed again', () => {
    const { getByLabelText, queryByText } = render(<ManageServicesScreen />);

    fireEvent.press(getByLabelText('Plumbing, Not requested'));
    expect(queryByText('Leak repair')).toBeTruthy();

    fireEvent.press(getByLabelText('Plumbing, Not requested'));
    expect(queryByText('Leak repair')).toBeNull();
  });
});

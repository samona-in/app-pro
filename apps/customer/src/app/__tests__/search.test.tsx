import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import type { ServiceOption, SkillWithService } from '@samona/types';
import { useBookingDraft } from '@/stores/booking';
import { useSearchStore } from '@/stores/search';
import Search from '../search';

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

// The catalogue hooks would reach the API, which needs a configured env.
jest.mock('@/hooks', () => ({
  useServiceSearch: () => ({ data: undefined, isPending: false, isError: false }),
  useServiceCategories: () => ({ data: [] }),
}));

// Secure storage needs a native module; the recents are seeded in the store.
jest.mock('@/services/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const plumbing: ServiceOption = {
  id: 's1',
  slug: 'plumbing',
  name: 'Plumbing',
  icon: null,
};

const leakRepair: SkillWithService = {
  id: 'sk1',
  serviceId: 's1',
  slug: 'leak-repair',
  name: 'Leak repair',
  icon: null,
  service: { id: 's1', slug: 'plumbing', name: 'Plumbing', icon: null },
};

/**
 * The nearest ancestor of `node` laid out as a wrapping row — the container the
 * recent chips share.
 */
function rowOf(node: ReactTestInstance): ReactTestInstance | null {
  let current = node.parent;
  while (current) {
    const className = current.props?.className;
    if (typeof className === 'string' && className.includes('flex-wrap')) return current;
    current = current.parent;
  }
  return null;
}

describe('Search — recent items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSearchStore.setState({
      recents: [
        { type: 'service', service: plumbing },
        { type: 'skill', skill: leakRepair },
      ],
      hydrated: true,
    });
    useBookingDraft.getState().reset();
  });

  it('shows the recent searches as chips in a wrapping row', async () => {
    render(<Search />);
    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy());

    // One chip per recent, carrying the name.
    const serviceChip = screen.getByLabelText('Plumbing');
    const skillChip = screen.getByLabelText('Leak repair');
    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.getByText('Leak repair')).toBeTruthy();

    // A chip is a compact pill...
    expect(serviceChip.props.className).toMatch(/rounded-lg/);
    expect(skillChip.props.className).toMatch(/rounded-lg/);

    // ...and the chips share one wrapping row rather than stacking as a list.
    const row = rowOf(serviceChip);
    expect(row).not.toBeNull();
    expect(rowOf(skillChip)).toBe(row);

    // The old list rows are gone: no subtitle line under the name.
    expect(screen.queryByText('View all skills')).toBeNull();
  });

  it('opens the service a service chip is tapped from', async () => {
    render(<Search />);
    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Plumbing'));

    expect(router.push).toHaveBeenCalledWith('/booking/new/plumbing/place');
  });

  it('opens the parent service with the skill preselected from a skill chip', async () => {
    render(<Search />);
    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Leak repair'));

    expect(router.push).toHaveBeenCalledWith('/booking/new/plumbing/place');
    expect(useBookingDraft.getState().skill?.name).toBe('Leak repair');
  });
});

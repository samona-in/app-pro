import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import type { ServiceOption, SkillWithService } from '@samona/types';
import { useBookingDraft } from '@/stores/booking';
import { useSearchStore } from '@/stores/search';
import Search from '../(tabs)/search';

// The icon set lazily loads a font, which triggers a state update outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
}));

// The catalogue hooks would reach the API, which needs a configured env.
let mockCategories: ServiceOption[] = [];

jest.mock('@/hooks', () => ({
  useServiceSearch: () => ({ data: undefined, isPending: false, isError: false }),
  useServiceCategories: () => ({ data: mockCategories }),
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

/**
 * The nearest ancestor of `node` whose class name matches `pattern`.
 */
function ancestorWith(node: ReactTestInstance, pattern: RegExp): ReactTestInstance | null {
  let current: ReactTestInstance | null = node;
  while (current) {
    const className = current.props?.className;
    if (typeof className === 'string' && pattern.test(className)) return current;
    current = current.parent;
  }
  return null;
}

describe('Search — the search field', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSearchStore.setState({ recents: [], hydrated: true });
    useBookingDraft.getState().reset();
  });

  it('keeps the back arrow inside the field and gives the field the full width', async () => {
    render(<Search />);

    const back = await screen.findByLabelText('Go back');
    const input = screen.getByLabelText('Search for a service or skill');

    // The arrow and the text share one container, so the arrow costs the
    // field no width of its own.
    const field = ancestorWith(back, /rounded-2xl/);
    expect(field).not.toBeNull();
    expect(ancestorWith(input, /rounded-2xl/)).toBe(field);

    // The field is the full width of the screen, minus the screen's margin.
    expect(ancestorWith(field as ReactTestInstance, /px-4/)).not.toBeNull();
    expect(input.props.className).toMatch(/flex-1/);
  });

  it('sends the customer back to home from the arrow in the field', async () => {
    render(<Search />);

    fireEvent.press(await screen.findByLabelText('Go back'));

    // The screen is a tab, so there is no stack to pop.
    expect(router.navigate).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });
});

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
    await waitFor(() => expect(screen.getByText('Recent searches')).toBeTruthy());

    // One chip per recent, carrying the name.
    const serviceChip = screen.getByLabelText('Plumbing');
    const skillChip = screen.getByLabelText('Leak repair');
    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.getByText('Leak repair')).toBeTruthy();

    // A chip is a compact pill...
    expect(serviceChip.props.className).toMatch(/rounded-full/);
    expect(skillChip.props.className).toMatch(/rounded-full/);

    // ...and the chips share one wrapping row rather than stacking as a list.
    const row = rowOf(serviceChip);
    expect(row).not.toBeNull();
    expect(rowOf(skillChip)).toBe(row);

    // The old list rows are gone: no subtitle line under the name.
    expect(screen.queryByText('View all skills')).toBeNull();
  });

  it('opens the service a service chip is tapped from', async () => {
    render(<Search />);
    await waitFor(() => expect(screen.getByText('Recent searches')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Plumbing'));

    expect(router.push).toHaveBeenCalledWith('/booking/new/plumbing/skill');
  });

  it('opens the parent service with the skill preselected from a skill chip', async () => {
    render(<Search />);
    await waitFor(() => expect(screen.getByText('Recent searches')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Leak repair'));

    expect(router.push).toHaveBeenCalledWith('/booking/new/plumbing/skill');
    expect(useBookingDraft.getState().skill?.name).toBe('Leak repair');
  });
});

describe('Search — browsing the catalogue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCategories = [plumbing];
    useSearchStore.setState({ recents: [], hydrated: true });
    useBookingDraft.getState().reset();
  });

  afterEach(() => {
    mockCategories = [];
  });

  it('wraps the services into a grid instead of a horizontal strip', () => {
    render(<Search />);

    expect(screen.getByText('Browse services')).toBeTruthy();

    // The tile shares the home screen's wrapping grid rather than scrolling
    // sideways in a rail.
    const tile = screen.getByLabelText('Plumbing');
    expect(ancestorWith(tile, /flex-wrap/)).not.toBeNull();
  });
});

describe('Search — clearing the field', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSearchStore.setState({ recents: [], hydrated: true });
    useBookingDraft.getState().reset();
  });

  it('empties the query from the clear button', () => {
    render(<Search />);

    const input = screen.getByLabelText('Search for a service or skill');
    fireEvent.changeText(input, 'plumbing');
    expect(input.props.value).toBe('plumbing');

    fireEvent.press(screen.getByLabelText('Clear search'));
    expect(input.props.value).toBe('');
  });
});

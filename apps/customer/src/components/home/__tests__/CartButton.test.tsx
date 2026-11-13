import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ServiceOption, SkillOption } from '@samona/types';
import { CartButton } from '../CartButton';
import { useBookingDraft } from '@/stores/booking';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const plumbing: ServiceOption = {
  id: 'svc-plumbing',
  slug: 'plumbing',
  name: 'Plumbing',
  icon: null,
};

function work(index: number): SkillOption {
  return {
    id: `sk-${index}`,
    serviceId: 'svc-plumbing',
    slug: `work-${index}`,
    name: `Work ${index}`,
    icon: null,
    pricingModel: 'PER_UNIT',
    basePricePaise: 10_000,
    unitLabel: 'unit',
    minQuantity: 1,
    maxQuantity: 5,
  };
}

function addWorks(count: number) {
  const draft = useBookingDraft.getState();
  draft.start(plumbing);
  for (let index = 0; index < count; index += 1) {
    draft.addItem({
      skill: work(index),
      customSkill: '',
      quantity: 1,
      durationMinutes: null,
      totalPaise: 10_000,
    });
  }
}

describe('CartButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBookingDraft.getState().reset();
  });

  it('shows the cart with no badge while the cart is empty', () => {
    render(<CartButton />);

    expect(screen.getByLabelText('Cart, empty')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('counts the works waiting in the cart', () => {
    addWorks(2);

    render(<CartButton />);

    expect(screen.getByLabelText('Cart, 2 works')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('caps the badge like the notification bell', () => {
    addWorks(10);

    render(<CartButton />);

    expect(screen.getByText('9+')).toBeTruthy();
  });

  it('opens the cart when pressed', () => {
    render(<CartButton />);

    fireEvent.press(screen.getByLabelText('Cart, empty'));

    expect(router.push).toHaveBeenCalledWith('/booking/cart');
  });
});

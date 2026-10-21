import type * as ReactTypes from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, FlatList } from 'react-native';
import { HOME_BANNERS } from '../home-banners';
import { HomeBannerCarousel } from '../HomeBannerCarousel';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof ReactTypes>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const WIDTH = Dimensions.get('window').width;

function scrollSpy() {
  return jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
}

function carousel() {
  return screen.UNSAFE_getByType(FlatList);
}

/** Lets the accessibility lookup settle so the component stops updating. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('HomeBannerCarousel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders the banners', async () => {
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    expect(screen.getByText('Your home needs care.')).toBeTruthy();
    expect(screen.getByText('Explore Services')).toBeTruthy();
  });

  it('advances to the next banner every five seconds', async () => {
    const scroll = scrollSpy();
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    expect(scroll).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(scroll).toHaveBeenCalledWith({ offset: WIDTH, animated: true });
  });

  it('keeps advancing one banner at a time', async () => {
    const scroll = scrollSpy();
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    for (let step = 1; step <= 3; step += 1) {
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(scroll).toHaveBeenLastCalledWith({ offset: step * WIDTH, animated: true });
    }
  });

  it('does not auto-advance while the customer is swiping', async () => {
    const scroll = scrollSpy();
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    act(() => {
      carousel().props.onScrollBeginDrag();
    });

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not auto-advance when the system asks for reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true as never);
    const scroll = scrollSpy();

    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(scroll).not.toHaveBeenCalled();
  });

  it('swaps the repeated last banner back for the first one', async () => {
    const scroll = scrollSpy();
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    act(() => {
      carousel().props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: HOME_BANNERS.length * WIDTH } },
      });
    });

    expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: false });
  });

  it('reports the tapped banner', async () => {
    const onPressBanner = jest.fn();
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={onPressBanner} />);
    await settle();

    fireEvent.press(screen.getByLabelText('Explore Services'));

    expect(onPressBanner).toHaveBeenCalledWith(HOME_BANNERS[0]);
  });
});

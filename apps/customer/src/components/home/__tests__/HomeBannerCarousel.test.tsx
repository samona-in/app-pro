import type * as ReactTypes from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions } from 'react-native';
import { Carousel } from 'react-native-reanimated-carousel';
import { HOME_BANNERS } from '../home-banners';
import { HomeBannerCard } from '../HomeBannerCard';
import { HomeBannerCarousel, BANNER_AUTOSCROLL_MS } from '../HomeBannerCarousel';

jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));

/** Cleanup callbacks of every mounted focus effect, so focus can be lost. */
const mockFocusCleanups: Array<() => void | undefined> = [];

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof ReactTypes>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => {
        const cleanup = effect();
        mockFocusCleanups.push(() => cleanup?.());
      }, [effect]);
    },
  };
});

const WIDTH = Dimensions.get('window').width;

function carousel() {
  return screen.UNSAFE_getByType(Carousel);
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
    mockFocusCleanups.length = 0;
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

  it('pages through the banners in a loop', async () => {
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    expect(carousel().props.data).toHaveLength(HOME_BANNERS.length);
    expect(carousel().props.loop).toBe(true);
    expect(carousel().props.snapMode).toBe('page');
    expect(carousel().props.itemSize).toBe(WIDTH);
  });

  it('advances to the next banner every five seconds', async () => {
    const timeout = jest.spyOn(global, 'setTimeout');
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    expect(carousel().props.autoplay).toBe(true);
    expect(carousel().props.autoplayInterval).toBe(BANNER_AUTOSCROLL_MS);
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), BANNER_AUTOSCROLL_MS);
  });

  it('does not auto-advance while the screen is in the background', async () => {
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    expect(carousel().props.autoplay).toBe(true);

    act(() => {
      mockFocusCleanups[0]?.();
    });

    expect(carousel().props.autoplay).toBe(false);
  });

  it('does not auto-advance when the system asks for reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true as never);

    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    expect(carousel().props.autoplay).toBe(false);
  });

  it('sweeps the banner spotlight while the screen is focused', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false as never);

    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    for (const card of screen.UNSAFE_getAllByType(HomeBannerCard)) {
      expect(card.props.spotlight).toBe(true);
    }
  });

  it('stops the banner spotlight when the screen is in the background', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false as never);

    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    act(() => {
      mockFocusCleanups[0]?.();
    });

    for (const card of screen.UNSAFE_getAllByType(HomeBannerCard)) {
      expect(card.props.spotlight).toBe(false);
    }
  });

  it('stops the banner spotlight under reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true as never);

    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    for (const card of screen.UNSAFE_getAllByType(HomeBannerCard)) {
      expect(card.props.spotlight).toBe(false);
    }
  });

  it('updates the settled index when the carousel snaps', async () => {
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={jest.fn()} />);
    await settle();

    act(() => {
      carousel().props.onSnapToItem(1);
    });

    expect(carousel().props.onSnapToItem).toBeDefined();
  });

  it('reports the tapped banner', async () => {
    const onPressBanner = jest.fn();
    render(<HomeBannerCarousel banners={HOME_BANNERS} onPressBanner={onPressBanner} />);
    await settle();

    fireEvent.press(screen.getByLabelText('Explore Services'));

    expect(onPressBanner).toHaveBeenCalledWith(HOME_BANNERS[0]);
  });
});

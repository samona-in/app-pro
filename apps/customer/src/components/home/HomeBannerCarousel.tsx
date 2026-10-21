import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { HomeBannerCard, BANNER_HEIGHT } from './HomeBannerCard';
import type { HomeBanner as HomeBannerData } from './home-banners';
import { useIsReduceMotionEnabled } from '@/hooks/use-reduce-motion';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/** How long a banner stays on screen before the carousel moves on. */
export const BANNER_AUTOSCROLL_MS = 5000;

export interface HomeBannerCarouselProps {
  banners: HomeBannerData[];
  /** Fired when a banner or its call to action is tapped. */
  onPressBanner: (banner: HomeBannerData) => void;
  className?: string;
}

/**
 * Horizontally scrolling promotional carousel for the home screen.
 *
 * The slides page one at a time, advance on their own every few seconds and
 * loop forever. Auto-advance pauses while the customer is swiping and while
 * the screen is in the background, and stays off entirely when the system
 * "reduce motion" setting is on — swiping by hand keeps working either way.
 */
export function HomeBannerCarousel({ banners, onPressBanner, className }: HomeBannerCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useIsReduceMotionEnabled();
  const listRef = useRef<FlatList<HomeBannerData>>(null);
  const [index, setIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  // The width of one slide. It is seeded with the window width so the first
  // paint is already correct, then confirmed against the list's own layout so
  // the paging stays exact wherever the carousel is placed.
  const [width, setWidth] = useState(windowWidth);

  const count = banners.length;

  // The first banner is repeated at the end so the carousel can loop without a
  // visible jump back to the start. The repeat is silently swapped for the
  // real first slide as soon as it settles.
  const slides = useMemo<HomeBannerData[]>(() => {
    const first = banners[0];
    if (!first || count < 2) return banners;
    return [...banners, first];
  }, [banners, count]);

  // The index lives in a ref as well so the auto-advance timer always reads
  // the current slide without re-creating itself mid-tick.
  const indexRef = useRef(0);
  const setCurrentIndex = useCallback((next: number) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  const scrollToSlide = useCallback(
    (target: number, animated: boolean) => {
      listRef.current?.scrollToOffset({ offset: target * width, animated });
    },
    [width],
  );

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    scrollToSlide(next, true);
    setCurrentIndex(next);
  }, [scrollToSlide, setCurrentIndex]);

  /** Snap to the slide the carousel came to rest on. */
  const settle = useCallback(
    (offsetX: number) => {
      const raw = Math.round(offsetX / width);
      if (raw >= count) {
        // The repeated first slide: return to the real one without animating.
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        setCurrentIndex(0);
        return;
      }
      setCurrentIndex(raw);
    },
    [count, setCurrentIndex, width],
  );

  const handleScrollBeginDrag = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIsDragging(false);
      settle(event.nativeEvent.contentOffset.x);
    },
    [settle],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIsDragging(false);
      settle(event.nativeEvent.contentOffset.x);
    },
    [settle],
  );

  // Confirm the slide width against the list's own layout, so the carousel
  // pages exactly wherever it is placed.
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (Math.abs(current - measured) > 1 ? measured : current));
  }, []);

  // Keep the current slide in place when the screen is rotated.
  const previousWidth = useRef(width);
  useEffect(() => {
    if (previousWidth.current === width) return;
    previousWidth.current = width;
    listRef.current?.scrollToOffset({ offset: indexRef.current * width, animated: false });
  }, [width]);

  // Auto-advance. The timer restarts after every slide and after every
  // interaction, so a banner always gets the full window on screen.
  useEffect(() => {
    if (count < 2 || reduceMotion || !isFocused || isDragging) return;
    const timer = setTimeout(advance, BANNER_AUTOSCROLL_MS);
    return () => clearTimeout(timer);
  }, [advance, count, index, isDragging, isFocused, reduceMotion]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<HomeBannerData> | null | undefined, itemIndex: number) => ({
      length: width,
      offset: width * itemIndex,
      index: itemIndex,
    }),
    [width],
  );

  const activeIndex = count > 0 ? index % count : 0;

  return (
    <View className={cn('-mx-5', className)}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        initialNumToRender={2}
        onLayout={handleLayout}
        keyExtractor={(item, itemIndex) => `${item.id}-${itemIndex}`}
        getItemLayout={getItemLayout}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({ item }) => (
          <View className="px-5" style={{ width }}>
            <HomeBannerCard banner={item} onPress={onPressBanner} />
          </View>
        )}
      />

      <View style={styles.dots}>
        {banners.map((banner, dotIndex) => (
          <View
            key={banner.id}
            style={[styles.dot, dotIndex === activeIndex ? styles.dotActive : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    height: BANNER_HEIGHT,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: color['border-strong'],
  },
  dotActive: {
    backgroundColor: color.brand,
  },
});

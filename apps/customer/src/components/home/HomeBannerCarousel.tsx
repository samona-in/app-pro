import { useCallback, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Carousel,
  type CarouselAnimation,
  type CarouselRenderItemInfo,
} from 'react-native-reanimated-carousel';
import { HomeBannerCard, BANNER_HEIGHT } from './HomeBannerCard';
import type { HomeBanner as HomeBannerData } from './home-banners';
import { useIsReduceMotionEnabled } from '@/hooks/use-reduce-motion';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/** How long a banner stays on screen before the carousel moves on. */
export const BANNER_AUTOSCROLL_MS = 5000;

/** How long a slide takes to slide into place. */
const BANNER_ANIMATION: CarouselAnimation = { type: 'timing', duration: 400 };

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
  const { width } = useWindowDimensions();
  const reduceMotion = useIsReduceMotionEnabled();
  const [index, setIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  // One slide fills the screen so the card keeps its 20px margins on both
  // sides while the carousel itself runs edge to edge.
  const renderItem = useCallback(
    ({ item }: CarouselRenderItemInfo<HomeBannerData>) => (
      <View className="px-5" style={{ width }}>
        <HomeBannerCard banner={item} onPress={onPressBanner} />
      </View>
    ),
    [onPressBanner, width],
  );

  return (
    <View className={cn('-mx-5', className)}>
      <Carousel
        data={banners}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        loop
        autoplay={!reduceMotion && isFocused}
        autoplayInterval={BANNER_AUTOSCROLL_MS}
        itemSize={width}
        snapMode="page"
        animation={BANNER_ANIMATION}
        onSnapToItem={setIndex}
        style={styles.carousel}
      />

      <View style={styles.dots}>
        {banners.map((banner, dotIndex) => (
          <View
            key={banner.id}
            testID={`home-banner-dot-${dotIndex}`}
            style={[styles.dot, dotIndex === index ? styles.dotActive : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: {
    width: '100%',
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

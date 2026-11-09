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
import { cn } from '@/utils/cn';

/** How long a banner stays on screen before the carousel moves on. */
export const BANNER_AUTOSCROLL_MS = 5000;

/** How long a slide takes to slide into place. */
const BANNER_ANIMATION: CarouselAnimation = { type: 'timing', duration: 400 };

/** The page gutter on either side of a banner card. */
const BANNER_GUTTER = 16;

export interface HomeBannerCarouselProps {
  banners: HomeBannerData[];
  /** Fired when a banner or its call to action is tapped. */
  onPressBanner: (banner: HomeBannerData) => void;
  className?: string;
  /** Use light dots on a dark/brand background. */
  variant?: 'default' | 'light';
  /** Override carousel height. */
  height?: number;
}

/**
 * Horizontally scrolling promotional carousel for the home screen.
 *
 * The slides page one at a time, advance on their own every few seconds and
 * loop forever. Auto-advance pauses while the customer is swiping and while
 * the screen is in the background, and stays off entirely when the system
 * "reduce motion" setting is on — swiping by hand keeps working either way.
 *
 * Each slide still fills the window so paging stays exact, but the card inside
 * is inset by the page gutter. A centred row of dots below tracks the slide.
 */
export function HomeBannerCarousel({
  banners,
  onPressBanner,
  className,
  variant = 'default',
  height = BANNER_HEIGHT,
}: HomeBannerCarouselProps) {
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

  const renderItem = useCallback(
    ({ item }: CarouselRenderItemInfo<HomeBannerData>) => (
      <View style={{ width, paddingHorizontal: BANNER_GUTTER }}>
        <HomeBannerCard
          banner={item}
          onPress={onPressBanner}
          height={height}
          variant={variant === 'light' ? 'hero' : 'default'}
          spotlight={!reduceMotion && isFocused}
        />
      </View>
    ),
    [onPressBanner, width, height, variant, reduceMotion, isFocused],
  );

  return (
    <View className={className}>
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
        style={[styles.carousel, { height }]}
      />

      {banners.length > 1 ? (
        <View
          testID="banner-pagination"
          pointerEvents="none"
          className="mt-3 flex-row items-center justify-center gap-1.5"
        >
          {banners.map((banner, dotIndex) => (
            <View
              key={banner.id}
              className={cn(
                'h-1.5 rounded-full',
                dotIndex === index ? 'w-4 bg-black' : 'w-1.5 bg-border-strong',
              )}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: {
    width: '100%',
    height: BANNER_HEIGHT,
  },
});

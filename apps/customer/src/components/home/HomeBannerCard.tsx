import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import type { HomeBanner as HomeBannerData } from './home-banners';

/** Height of a banner card, in points. */
export const BANNER_HEIGHT = 150;

export interface HomeBannerCardProps {
  banner: HomeBannerData;
  /** Fired when the card or its call to action is tapped. */
  onPress: (banner: HomeBannerData) => void;
  height?: number;
  /** Use the hero styling inside a brand-blue band. */
  variant?: 'default' | 'hero';
}

/**
 * A single promotional banner card.
 *
 * The copy sits in the left column and the illustration floats on the right
 * half of the brand-blue card. The columns never overlap, so the headline
 * stays legible on every screen width.
 */
export function HomeBannerCard({ banner, onPress, height = BANNER_HEIGHT }: HomeBannerCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={banner.heading}
      accessibilityHint={banner.subtitle}
      onPress={() => onPress(banner)}
      style={[styles.card, { height }]}
      className="overflow-hidden rounded-xl bg-brand"
    >
      <View style={styles.copy}>
        <Text variant="title" numberOfLines={2} style={styles.heading}>
          {banner.heading}
        </Text>
        <Text variant="footnote" numberOfLines={2} style={styles.subtitle}>
          {banner.subtitle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={banner.ctaLabel}
          onPress={() => onPress(banner)}
          hitSlop={8}
          style={styles.cta}
        >
          <Text variant="footnote" className="font-semibold" style={styles.ctaLabel}>
            {banner.ctaLabel}
          </Text>
          <Ionicons name="arrow-forward" size={13} color={color.brand} style={styles.ctaIcon} />
        </Pressable>
      </View>

      <Image
        source={banner.image}
        style={[styles.art, { height }]}
        contentFit="contain"
        transition={0}
        accessibilityLabel={banner.imageDescription}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  copy: {
    flex: 1,
    paddingLeft: 16,
    paddingRight: 2,
    justifyContent: 'center',
  },
  heading: {
    color: color['brand-contrast'],
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.78)',
    marginTop: 4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: color['brand-contrast'],
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  ctaLabel: {
    color: color.brand,
  },
  ctaIcon: {
    marginLeft: 6,
  },
  art: {
    width: '36%',
    height: BANNER_HEIGHT,
  },
});

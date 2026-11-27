import { View } from 'react-native';
import { Image } from 'expo-image';
import brandImage from '@/assets/images/samona-hyderabad-line-art.png';

/**
 * The closing brand image on the pro home sheet.
 *
 * Rendered at the artwork's natural aspect ratio instead of cropped into a
 * short banner, so the wordmark and the Hyderabad skyline stay whole. It sits
 * at the end of the sheet body, replacing the old "made in Hyderabad" line.
 */

/** Source artwork is 1536 × 1024. */
const BRAND_ASPECT_RATIO = 1536 / 1024;

/** Fades the artwork so its dark line-work reads as a soft watermark. */
const BRAND_IMAGE_OPACITY = 0.3;

export interface BrandBannerProps {
  className?: string;
}

export function BrandBanner({ className }: BrandBannerProps) {
  return (
    <View className={className}>
      <Image
        source={brandImage}
        style={{
          width: '100%',
          aspectRatio: BRAND_ASPECT_RATIO,
          opacity: BRAND_IMAGE_OPACITY,
        }}
        contentFit="cover"
        // No cross-fade: its Android fade can leave the image blank when the
        // home tab reattaches behind another screen (same reason as ServiceImage).
        transition={0}
        cachePolicy="memory-disk"
        priority="low"
        accessibilityLabel="Samona — your on-demand home services, built for Hyderabad"
      />
    </View>
  );
}

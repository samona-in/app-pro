import { View } from 'react-native';
import { Image } from 'expo-image';

/**
 * The closing brand image on the customer home.
 *
 * Rendered full-bleed at the natural aspect ratio of the artwork instead of
 * being cropped into a short banner, so the wordmark and the Hyderabad skyline
 * stay whole. It sits at the very end of the scroll, after the popular rail.
 */
const BRAND_IMAGE_URL =
  'https://mbylupexffssmyiqgwnb.supabase.co/storage/v1/object/public/services/samona-graphics.jpeg';

/** Source artwork is 1236 × 1272. */
const BRAND_ASPECT_RATIO = 1236 / 1272;

export interface BrandBannerProps {
  className?: string;
}

export function BrandBanner({ className }: BrandBannerProps) {
  return (
    <View className={className}>
      <Image
        source={BRAND_IMAGE_URL}
        style={{ width: '100%', aspectRatio: BRAND_ASPECT_RATIO }}
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

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import type { AadhaarSide } from '@/utils/aadhaar-flow';
import { AADHAAR_CARD_ASPECT_RATIO } from '@/utils/aadhaar-card';
import { cn } from '@/utils/cn';
import backExample from '@/assets/images/aadhaar-back-example.webp';
import frontExample from '@/assets/images/aadhaar-front-example.webp';

export interface AadhaarReferenceCardProps {
  className?: string;
  /**
   * When set, the card becomes a single-side example at full card proportions —
   * used under the live camera so the Pro can compare the frame with the side
   * being captured. Without it, the both-sides reference is shown (the intro
   * screen).
   */
  side?: AadhaarSide;
}

/**
 * A generic, non-sensitive illustration of an Aadhaar card.
 *
 * It exists to set expectations before the camera opens — the Pro sees the
 * card-like proportions the framing guide uses. Nothing here is copied from a
 * real card: no number, name or address, and no UIDAI marks. Both sides use the
 * supplied example images, rendered inside the same card-ratio frame as the
 * live camera so the comparison is one-to-one.
 */
export function AadhaarReferenceCard({ className, side }: AadhaarReferenceCardProps) {
  const { t } = useTranslation();

  if (side) {
    return (
      <View className={cn('items-center', className)}>
        <View className="w-full overflow-hidden rounded-xl border border-border-strong bg-surface">
          <ExampleCard side={side} />
        </View>
        <Text variant="footnote" className="mt-2 font-semibold">
          {t(
            side === 'front'
              ? 'aadhaar.capture.referenceFrontTitle'
              : 'aadhaar.capture.referenceBackTitle',
          )}
        </Text>
        <Text variant="caption" className="mt-0.5 text-center text-text-secondary">
          {t('aadhaar.reference.subtitle')}
        </Text>
      </View>
    );
  }

  return (
    <View className={cn(' border border-border elevation rounded-lg bg-surface p-3', className)}>
      <View className="mb-3 flex-row items-center">
        <View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-brand-soft">
          <Ionicons name="card-outline" size={18} color={color.brand} />
        </View>
        <View className="flex-1">
          <Text variant="body" className="font-semibold">
            {t('aadhaar.reference.title')}
          </Text>
          <Text variant="caption" className="text-text-secondary">
            {t('aadhaar.reference.subtitle')}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <MiniCard side="front" label={t('aadhaar.reference.front')} />
        <MiniCard side="back" label={t('aadhaar.reference.back')} />
      </View>
    </View>
  );
}

/**
 * The supplied example for one side, filling a frame at the exact card ratio.
 *
 * Both assets are prepared offline at card proportions, so each one fills the
 * frame edge to edge exactly the way the live camera frame will.
 */
function ExampleCard({ side }: { side: AadhaarSide }) {
  return (
    <Image
      source={side === 'front' ? frontExample : backExample}
      style={{ width: '100%', aspectRatio: AADHAAR_CARD_ASPECT_RATIO }}
      contentFit="cover"
    />
  );
}

function MiniCard({ side, label }: { side: AadhaarSide; label: string }) {
  return (
    <View className="flex-1" accessible accessibilityLabel={label}>
      <View className="overflow-hidden rounded-lg border border-border-strong">
        <ExampleCard side={side} />
      </View>
      <Text variant="caption" className="mt-1.5 text-center text-text-secondary">
        {label}
      </Text>
    </View>
  );
}

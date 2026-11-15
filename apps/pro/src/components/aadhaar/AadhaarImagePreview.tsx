import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconButton, Text } from '@/components/ui';
import { color } from '@/theme';
import type { AadhaarSide } from '@/utils/aadhaar-flow';
import { AADHAAR_CARD_ASPECT_RATIO } from '@/utils/aadhaar-card';
import type { AadhaarImage } from '@/utils/aadhaar-image';

export interface AadhaarImagePreviewProps {
  side: AadhaarSide;
  image: AadhaarImage;
  onRetake: () => void;
  onConfirm: () => void;
}

/**
 * One captured side, shown at the card proportions it was cropped to, so the
 * Pro checks exactly what will be uploaded. Retake discards the local files and
 * returns to the live camera; using it advances the state machine
 * (front → back, or back → review).
 */
export function AadhaarImagePreview({
  side,
  image,
  onRetake,
  onConfirm,
}: AadhaarImagePreviewProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const title = side === 'front' ? t('aadhaar.preview.frontTitle') : t('aadhaar.preview.backTitle');
  const imageLabel = side === 'front' ? t('aadhaar.a11y.frontImage') : t('aadhaar.a11y.backImage');

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="dark" />

      <View className="flex-row items-center px-4 pb-3" style={{ paddingTop: insets.top + 4 }}>
        <IconButton
          name="arrow-back"
          accessibilityLabel={t('common.back')}
          onPress={onRetake}
          tint={color['text-primary']}
        />
        <View className="flex-1 items-center">
          <Text variant="body" className="font-semibold">
            {title}
          </Text>
          <Text variant="caption" className="mt-0.5 text-text-secondary">
            {side === 'front' ? t('aadhaar.preview.stepOne') : t('aadhaar.preview.stepTwo')}
          </Text>
        </View>
        {/* Balances the back button so the title stays optically centred. */}
        <View className="h-11 w-11" />
      </View>

      <View className="flex-1 justify-center px-5">
        <View
          className="overflow-hidden rounded-xl bg-black"
          style={{ width: '100%', aspectRatio: AADHAAR_CARD_ASPECT_RATIO }}
        >
          <Image
            source={{ uri: image.uri }}
            style={{ flex: 1 }}
            contentFit="cover"
            accessible
            accessibilityLabel={imageLabel}
          />
        </View>
      </View>

      <View className="px-5" style={{ paddingBottom: insets.bottom + 16, paddingTop: 16 }}>
        <View className="mb-4 flex-row items-center justify-center">
          <Ionicons name="checkmark-circle-outline" size={18} color={color.success} />
          <Text variant="footnote" className="ml-2 text-text-secondary">
            {t('aadhaar.preview.hint')}
          </Text>
        </View>
        <Button label={t('aadhaar.preview.use')} size="lg" onPress={onConfirm} />
        <Button
          label={t('aadhaar.preview.retake')}
          variant="secondary"
          size="lg"
          onPress={onRetake}
          className="mt-2"
        />
      </View>
    </View>
  );
}

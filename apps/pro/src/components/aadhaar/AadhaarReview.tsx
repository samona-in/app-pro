import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Badge, Button, IconButton, Screen, Text } from '@/components/ui';
import { color, elevation } from '@/theme';
import type { AadhaarSide } from '@/utils/aadhaar-flow';
import type { AadhaarUploaded } from '@/utils/aadhaar-upload';
import { AADHAAR_CARD_ASPECT_RATIO } from '@/utils/aadhaar-card';
import type { AadhaarImage } from '@/utils/aadhaar-image';

export interface AadhaarReviewProps {
  images: Record<AadhaarSide, AadhaarImage>;
  uploaded: AadhaarUploaded;
  isSubmitting: boolean;
  errorMessage: string | null;
  onSubmit: () => void;
  onRetake: (side: AadhaarSide) => void;
  onBack: () => void;
}

/**
 * Final check before anything is sent: both sides, a plain-language consent
 * reminder, and the one submit action.
 *
 * A side that already reached the server after a partial failure is flagged
 * "Saved" and its retake action is removed. Retaking it would leave the saved
 * row behind while uploading a second one, so the UI keeps the two attempts
 * honest instead of silently duplicating a document.
 */
export function AadhaarReview({
  images,
  uploaded,
  isSubmitting,
  errorMessage,
  onSubmit,
  onRetake,
  onBack,
}: AadhaarReviewProps) {
  const { t } = useTranslation();
  const savedSides = (['front', 'back'] as const).filter((side) => uploaded[side]);

  return (
    <Screen
      scrollable
      edges={['top', 'bottom']}
      className="bg-surface"
      contentClassName="pb-4"
      footer={
        <View className="gap-3 pb-4 pt-4">
          {errorMessage ? (
            <View style={elevation.md} className="rounded-lg bg-surface p-3">
              {savedSides.length > 0 ? (
                <Text variant="footnote" className="mb-1 font-semibold text-danger">
                  {t('aadhaar.review.partialTitle')}
                </Text>
              ) : null}
              <Text variant="footnote" className="text-danger">
                {errorMessage}
              </Text>
            </View>
          ) : null}
          <Button
            label={isSubmitting ? t('aadhaar.review.submitting') : t('aadhaar.review.submit')}
            size="lg"
            loading={isSubmitting}
            disabled={isSubmitting}
            onPress={onSubmit}
          />
        </View>
      }
    >
      <View className="flex-row items-center pb-2 pt-2">
        <IconButton
          name="arrow-back"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          tint={color['text-primary']}
        />
        <View className="flex-1 items-center">
          <Text variant="title" className="font-semibold">
            {t('aadhaar.review.title')}
          </Text>
        </View>
        <View className="h-11 w-11" />
      </View>

      <Text variant="body" className="mt-1 text-text-secondary">
        {t('aadhaar.review.subtitle')}
      </Text>

      <View className="mt-5 gap-4">
        <ReviewSide
          side="front"
          image={images.front}
          saved={Boolean(uploaded.front)}
          onRetake={onRetake}
        />
        <ReviewSide
          side="back"
          image={images.back}
          saved={Boolean(uploaded.back)}
          onRetake={onRetake}
        />
      </View>

      <View className="mt-5 flex-row items-start rounded-xl bg-surface-tint p-4">
        <Ionicons name="lock-closed-outline" size={18} color={color.brand} />
        <Text variant="footnote" className="ml-2 flex-1 text-text-secondary">
          {t('aadhaar.review.consentReminder')}
        </Text>
      </View>

      <Text variant="caption" className="mt-4 text-center text-text-muted">
        {t('aadhaar.review.pendingNote')}
      </Text>
    </Screen>
  );
}

function ReviewSide({
  side,
  image,
  saved,
  onRetake,
}: {
  side: AadhaarSide;
  image: AadhaarImage;
  saved: boolean;
  onRetake: (side: AadhaarSide) => void;
}) {
  const { t } = useTranslation();
  const label = side === 'front' ? t('aadhaar.review.frontLabel') : t('aadhaar.review.backLabel');
  const imageLabel = side === 'front' ? t('aadhaar.a11y.frontImage') : t('aadhaar.a11y.backImage');

  return (
    <View className="rounded-xl border border-border bg-surface p-3">
      <View className="overflow-hidden rounded-lg bg-surface-muted">
        <Image
          source={{ uri: image.uri }}
          style={{ width: '100%', aspectRatio: AADHAAR_CARD_ASPECT_RATIO }}
          contentFit="cover"
          accessible
          accessibilityLabel={imageLabel}
        />
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-1">
          <Text variant="body" className="font-semibold">
            {label}
          </Text>
          <Text variant="caption" className="mt-0.5 text-text-secondary">
            {saved ? t('aadhaar.review.savedHint') : t('aadhaar.review.readyHint')}
          </Text>
        </View>

        {saved ? (
          <Badge label={t('aadhaar.review.saved')} tone="success" />
        ) : (
          <Button
            label={t('aadhaar.review.retake')}
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => onRetake(side)}
            leading={<Ionicons name="refresh-outline" size={16} color={color['text-primary']} />}
          />
        )}
      </View>
    </View>
  );
}

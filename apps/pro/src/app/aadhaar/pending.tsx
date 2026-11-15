import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Screen, Text } from '@/components/ui';
import type { AadhaarFlowSource } from '@/components/aadhaar';
import { color } from '@/theme';

/**
 * Confirmation that the photos were submitted, not that the Aadhaar was
 * verified. The row is `PENDING` until the existing review team approves it,
 * so the copy promises a review, never an instant verdict.
 */
export default function AadhaarPendingScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ source?: string }>();
  const source: AadhaarFlowSource = params.source === 'onboarding' ? 'onboarding' : 'profile';

  /** Drops the Aadhaar screens, then continues the parent flow. */
  function continueFlow() {
    if (source === 'onboarding') {
      // Onboarding asks for Aadhaar instead of a documents screen, so the
      // face check is the next step once the proof is submitted.
      router.dismissTo('/onboarding/about');
      router.push('/onboarding/face');
      return;
    }
    router.dismissTo('/documents');
  }

  return (
    <Screen
      edges={['top', 'bottom']}
      className="bg-surface"
      footer={
        <View className="pb-4 pt-4">
          <Button
            label={
              source === 'onboarding'
                ? t('aadhaar.pending.continueOnboarding')
                : t('aadhaar.pending.done')
            }
            size="lg"
            onPress={continueFlow}
          />
        </View>
      }
    >
      <View className="flex-1 items-center justify-center px-2">
        <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-success-surface">
          <Ionicons name="checkmark-circle" size={44} color={color.success} />
        </View>

        <Text variant="titleLg" className="text-center">
          {t('aadhaar.pending.title')}
        </Text>
        <Text variant="body" className="mt-2 text-center text-text-secondary">
          {t('aadhaar.pending.body')}
        </Text>

        <Badge label={t('aadhaar.pending.status')} tone="warning" className="mt-5" />

        <View className="mt-6 w-full rounded-xl p-4">
          <View className="flex-row items-start">
            <Ionicons name="notifications-outline" size={18} color={color.brand} />
            <Text variant="footnote" className="ml-2 flex-1 text-text-secondary">
              {t('aadhaar.pending.note')}
            </Text>
          </View>
          <View className="mt-3 flex-row items-start">
            <Ionicons name="shield-checkmark-outline" size={18} color={color.brand} />
            <Text variant="footnote" className="ml-2 flex-1 text-text-secondary">
              {t('aadhaar.pending.reviewNote')}
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

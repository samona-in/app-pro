import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { LOCATION_DEFAULTS } from '@samona/config';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Card, Screen, ServiceRadiusSlider, Text } from '@/components/ui';
import { useProProfile, useUpdateServiceRadius } from '@/hooks';
import { decideRadiusSave } from '@/utils/service-radius';

/**
 * Service area — how far this pro will travel to jobs.
 *
 * Reached from the Profile settings row. The slider commits on release only,
 * so a drag never spams the network. The optimistic radius is shown while a
 * release is saved; a failure discards it and offers a retry, letting the
 * query cache (the last confirmed value) take back the screen.
 */
export default function ServiceAreasScreen() {
  const { t } = useTranslation();
  const { data: profile, isPending, isError, refetch } = useProProfile();
  const update = useUpdateServiceRadius();

  const [pendingRadius, setPendingRadius] = useState<number | null>(null);
  const failedRadius = useRef<number | null>(null);

  const savedRadius = profile?.serviceRadiusKm ?? LOCATION_DEFAULTS.serviceRadiusKm;
  const displayRadius = pendingRadius ?? savedRadius;

  function commit(km: number) {
    setPendingRadius(km);
    update.mutate(km, {
      onSuccess: () => {
        setPendingRadius(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      },
      onError: () => {
        failedRadius.current = km;
        setPendingRadius(null);
        Alert.alert(t('serviceAreas.saveErrorTitle'), t('serviceAreas.saveError'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.tryAgain'), onPress: onRetry },
        ]);
      },
    });
  }

  function onRetry() {
    const km = failedRadius.current;
    if (km === null) return;
    failedRadius.current = null;
    commit(km);
  }

  function onRelease(km: number) {
    if (!decideRadiusSave(km, savedRadius, update.isPending).shouldSave) return;
    failedRadius.current = null;
    commit(km);
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingState message={t('serviceAreas.loading')} />
      </Screen>
    );
  }

  if (isError || !profile) {
    return (
      <Screen>
        <ErrorState onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">{t('serviceAreas.title')}</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('serviceAreas.subtitle')}
        </Text>
      </View>

      <Card className="mt-4">
        <View className="flex-row items-center">
          <View className="flex-1 pr-4">
            <Text variant="body" className="font-semibold">
              {t('serviceAreas.current')}
            </Text>
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
              {t('serviceAreas.caption')}
            </Text>
          </View>
          <Text variant="titleLg">{t('format.km', { value: displayRadius })}</Text>
        </View>

        <View className="mt-8">
          <ServiceRadiusSlider
            value={displayRadius}
            min={LOCATION_DEFAULTS.minServiceRadiusKm}
            max={LOCATION_DEFAULTS.maxServiceRadiusKm}
            loading={update.isPending}
            onRelease={onRelease}
            accessibilityLabel={t('serviceAreas.sliderA11y')}
          />
          <View className="mt-1 flex-row justify-between px-5">
            <Text variant="footnote" className="text-text-muted">
              {t('format.km', { value: LOCATION_DEFAULTS.minServiceRadiusKm })}
            </Text>
            <Text variant="footnote" className="text-text-muted">
              {t('format.km', { value: LOCATION_DEFAULTS.maxServiceRadiusKm })}
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { LOCATION_DEFAULTS } from '@samona/config';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Divider, Screen, ServiceRadiusSlider, Text } from '@/components/ui';
import { useProProfile, useUpdateServiceRadius } from '@/hooks';
import { decideRadiusSave } from '@/utils/service-radius';

/**
 * Service area — how far this pro will travel to jobs.
 *
 * Reached from the Profile settings row. The thumb's position is one local
 * piece of state (`radius`), seeded once from the backend. While the pro
 * drags, only the finger moves the thumb — a refetch or mutation response can
 * never yank it back to a stale/default value. The network is hit once per
 * release, never per movement; a failed save rolls the thumb back to the last
 * confirmed radius and offers a retry.
 */
export default function ServiceAreasScreen() {
  const { t } = useTranslation();
  const { data: profile, isPending, isError, refetch } = useProProfile();
  const update = useUpdateServiceRadius();

  const [radius, setRadius] = useState<number | null>(null);
  // Seed the thumb exactly once; afterwards server data never overwrites a
  // live drag or a pending save.
  const initializedRef = useRef(false);
  /** The last radius the server confirmed — what `decideRadiusSave` compares against. */
  const lastConfirmedRadius = useRef<number | null>(null);
  const failedRadius = useRef<number | null>(null);

  useEffect(() => {
    if (!initializedRef.current && profile?.serviceRadiusKm != null) {
      setRadius(profile.serviceRadiusKm);
      lastConfirmedRadius.current = profile.serviceRadiusKm;
      initializedRef.current = true;
    }
  }, [profile?.serviceRadiusKm]);

  const shownRadius = radius ?? profile?.serviceRadiusKm ?? LOCATION_DEFAULTS.serviceRadiusKm;

  function commit(km: number) {
    update.mutate(km, {
      onSuccess: () => {
        lastConfirmedRadius.current = km;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      },
      onError: () => {
        failedRadius.current = km;
        // The server kept the old value; put the thumb back on it.
        setRadius(lastConfirmedRadius.current ?? km);
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
    setRadius(km);
    commit(km);
  }

  function onRelease(km: number) {
    setRadius(km);
    if (
      !decideRadiusSave(km, lastConfirmedRadius.current ?? shownRadius, update.isPending).shouldSave
    )
      return;
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
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('serviceAreas.subtitle')}
        </Text>
      </View>

      <View className="mt-4">
        <View className="flex-row items-center py-3">
          <View className="flex-1 pr-4">
            <Text variant="body" className="font-semibold">
              {t('serviceAreas.current')}
            </Text>
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
              {t('serviceAreas.caption')}
            </Text>
          </View>
          <Text variant="titleLg">{t('format.km', { value: shownRadius })}</Text>
        </View>

        <Divider className="-mx-5" />

        <View className="mt-8">
          <ServiceRadiusSlider
            value={shownRadius}
            min={LOCATION_DEFAULTS.minServiceRadiusKm}
            max={LOCATION_DEFAULTS.maxServiceRadiusKm}
            loading={update.isPending}
            onValueChange={(km) => setRadius(km)}
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
      </View>
    </Screen>
  );
}

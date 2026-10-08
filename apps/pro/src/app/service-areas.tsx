import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { LOCATION_DEFAULTS } from '@samona/config';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Card, Screen, ServiceRadiusSlider, type RadiusDebugFrame, Text } from '@/components/ui';
import { useProProfile, useUpdateServiceRadius } from '@/hooks';
import { decideRadiusSave } from '@/utils/service-radius';

// TEMP diagnostic overlay for the drag issue. Remove along with onDebug before merge.
const SHOW_RADIUS_DEBUG = true;

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
  const [debugFrame, setDebugFrame] = useState<RadiusDebugFrame | null>(null);
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
    if (!decideRadiusSave(km, lastConfirmedRadius.current ?? shownRadius, update.isPending).shouldSave)
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
          <Text variant="titleLg">{t('format.km', { value: shownRadius })}</Text>
        </View>

        <View className="mt-8">
          <ServiceRadiusSlider
            value={shownRadius}
            min={LOCATION_DEFAULTS.minServiceRadiusKm}
            max={LOCATION_DEFAULTS.maxServiceRadiusKm}
            loading={update.isPending}
            onValueChange={(km) => setRadius(km)}
            onRelease={onRelease}
            onDebug={setDebugFrame}
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
          {SHOW_RADIUS_DEBUG ? (
            <View className="mt-3 rounded-lg border border-border bg-surface-muted p-2">
              <Text variant="caption" className="text-text-muted">
                debug (drag thumb, read last frame)
              </Text>
              {(() => {
                const f = debugFrame;
                if (!f) return <Text variant="caption">no gesture yet</Text>;
                const km = Math.round(
                  (f.translateX /
                    Math.max(1, f.trackWidth - 40 - 20 * 2)) *
                    (LOCATION_DEFAULTS.maxServiceRadiusKm - LOCATION_DEFAULTS.minServiceRadiusKm) +
                    LOCATION_DEFAULTS.minServiceRadiusKm,
                );
                return (
                  <Text variant="caption" className="text-text-secondary">
                    {'phase=' + f.phase + ' count=' + f.count + '\n' +
                      'track=' + f.trackWidth.toFixed(0) + '\n' +
                      'x=' + f.pointerX.toFixed(0) + ' finger0=' + f.startFingerX.toFixed(0) + '\n' +
                      'dx=(x-finger0)=' + (f.pointerX - f.startFingerX).toFixed(0) + '\n' +
                      'knob0=' + f.startKnob.toFixed(0) + ' knob=' + f.translateX.toFixed(0) + '\n' +
                      'translationX=' + f.translationX.toFixed(0) + ' km~' + km}
                  </Text>
                );
              })()}
            </View>
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}
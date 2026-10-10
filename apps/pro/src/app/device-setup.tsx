import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Divider, Screen, Text } from '@/components/ui';
import { useDeviceReadiness } from '@/hooks';
import type { TranslationKey } from '@/i18n';
import { cn } from '@/utils/cn';
import type { DeviceReadiness } from '@/services/device-readiness-state';
import { DEVICE_READINESS_KEYS, missingReadinessCount } from '@/services/device-readiness-state';
import {
  getDeviceManufacturer,
  openBackgroundDataSettings,
  openNotificationSettings,
  requestIgnoreBatteryOptimization,
} from '@/services/device-readiness';
import { requestFullScreenIntent } from '@/services/full-screen-alert';
import { requestOverlayPermission } from '@/services/overlay-alert';

/**
 * Job-alert setup — the fix-it screen a pro lands on when the device cannot
 * reliably raise a job alert while the app is closed.
 *
 * Four settings are measurable and each has a "Fix" button that opens the exact
 * system settings screen. OEM sleep lists (autostart, never-sleep, boosting)
 * have no public API, so they are a per-manufacturer guide rather than a
 * check. The pro reviews, fixes, and comes back — the app re-probes on
 * foreground, so the checklist and the go-online gate update on their own.
 */

interface ReadinessItem {
  key: keyof DeviceReadiness;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey | null;
  fix: () => Promise<boolean> | boolean;
}

const ITEMS: ReadinessItem[] = [
  {
    key: 'notificationsEnabled',
    titleKey: 'deviceSetup.items.notifications.title',
    descriptionKey: 'deviceSetup.items.notifications.description',
    fix: openNotificationSettings,
  },
  {
    key: 'fullScreenAlertsEnabled',
    titleKey: 'deviceSetup.items.fullScreen.title',
    descriptionKey: 'deviceSetup.items.fullScreen.description',
    fix: requestFullScreenIntent,
  },
  {
    // The native overlay banner draws over any app and needs the system's
    // "display over other apps" permission. It is measured but non-blocking
    // (online gating excludes it), yet always shown here so the pro can grant
    // it — the overlay is only useful once it is actually on.
    key: 'overlayPermissionEnabled',
    titleKey: 'deviceSetup.items.overlay.title',
    descriptionKey: null,
    fix: requestOverlayPermission,
  },
  {
    key: 'batteryOptimizationIgnored',
    titleKey: 'deviceSetup.items.battery.title',
    descriptionKey: 'deviceSetup.items.battery.description',
    fix: requestIgnoreBatteryOptimization,
  },
  {
    key: 'backgroundDataAllowed',
    titleKey: 'deviceSetup.items.backgroundData.title',
    descriptionKey: 'deviceSetup.items.backgroundData.description',
    fix: openBackgroundDataSettings,
  },
];

function oemGuide(t: TFunction, manufacturer: string): string {
  const brand = manufacturer.toLowerCase();
  if (brand.includes('xiaomi') || brand.includes('redmi')) {
    return t('deviceSetup.oemGuides.miui');
  }
  if (brand.includes('samsung')) {
    return t('deviceSetup.oemGuides.samsung');
  }
  if (brand.includes('oneplus')) {
    return t('deviceSetup.oemGuides.oneplus');
  }
  if (brand.includes('oppo') || brand.includes('vivo') || brand.includes('realme')) {
    return t('deviceSetup.oemGuides.coloros');
  }
  if (brand.includes('nothing') || brand.includes('google') || brand.includes('motorola')) {
    return t('deviceSetup.oemGuides.nearStock');
  }
  return t('deviceSetup.oemGuides.generic');
}

function checklistRow(item: ReadinessItem, ok: boolean, t: TFunction) {
  return (
    <View className="min-h-[72px] justify-center py-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text variant="bodyLg" className="font-semibold">
            {t(item.titleKey)}
          </Text>
          {item.descriptionKey ? (
            <Text variant="footnote" className="mt-1 text-text-secondary">
              {t(item.descriptionKey)}
            </Text>
          ) : null}
        </View>
        <Badge
          label={ok ? t('common.on') : t('common.off')}
          tone={ok ? 'success' : 'warning'}
          withDot
        />
      </View>
      {!ok ? (
        <View className="mt-3 items-start">
          <Button
            variant="secondary"
            size="sm"
            label={t('home.fix')}
            haptic={false}
            onPress={() => void item.fix()}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function DeviceSetup() {
  const { t } = useTranslation();
  const { readiness, refreshDeviceReadiness } = useDeviceReadiness();
  const [checking, setChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  async function handleCheckAgain() {
    setChecking(true);
    try {
      await refreshDeviceReadiness();
      setHasChecked(true);
    } finally {
      setChecking(false);
    }
  }

  // The overlay permission is measured but deliberately non-blocking (go-online
  // uses DEVICE_READINESS_KEYS only). It is still part of this checklist — the
  // whole point is that a pro can grant "Appear on top" here — so count it
  // alongside the blocking settings and require it for the "All set" state.
  const allReady = readiness !== null && missingReadinessCount(readiness) === 0;
  const overlayMissing = readiness?.overlayPermissionEnabled === false;
  const isReady = allReady && !overlayMissing;
  const total = DEVICE_READINESS_KEYS.length + 1;
  const openCount =
    readiness === null ? total : missingReadinessCount(readiness) + (overlayMissing ? 1 : 0);

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('deviceSetup.subtitle')}
        </Text>
      </View>

      {isReady ? (
        <View className="-mx-5 mt-6 bg-success-surface px-5 py-4">
          <Text variant="bodyLg" className="font-semibold text-success">
            {t('deviceSetup.allSet')}
          </Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            {t('deviceSetup.allSetMessage')}
          </Text>
        </View>
      ) : (
        <View className="mt-2">
          {readiness === null ? (
            <Text variant="footnote" className="mt-6 text-center text-text-muted">
              {t('deviceSetup.checkingSettings')}
            </Text>
          ) : (
            ITEMS.map((item, index) => (
              <View key={item.key}>
                {index > 0 ? <Divider className="-mx-5" /> : null}
                {checklistRow(item, readiness[item.key], t)}
              </View>
            ))
          )}
        </View>
      )}

      <View className="-mx-5 mt-6 bg-surface-muted px-5 py-4">
        <Badge label={t('deviceSetup.forYourPhone')} tone="info" />
        <Text variant="body" className="mt-3 font-semibold">
          {t('deviceSetup.outOfSleepTitle')}
        </Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('deviceSetup.outOfSleepMessage')}
        </Text>
        <Text variant="footnote" className="mt-3 text-text-secondary">
          {oemGuide(t, getDeviceManufacturer())}
        </Text>
      </View>

      <View className="mt-8">
        <Button
          variant="secondary"
          label={checking ? t('deviceSetup.checking') : t('deviceSetup.checkAgain')}
          loading={checking}
          haptic={false}
          onPress={() => void handleCheckAgain()}
        />
        {hasChecked ? (
          <View
            className={cn(
              '-mx-5 mt-3 px-5 py-4',
              isReady ? 'bg-success-surface' : 'bg-warning-surface',
            )}
          >
            <Text
              variant="body"
              className={cn('font-semibold', isReady ? 'text-success' : 'text-warning')}
            >
              {isReady
                ? t('deviceSetup.statusAllOn')
                : t('deviceSetup.statusNeedsAttention', { openCount, total })}
            </Text>
            <Text variant="footnote" className="mt-1 text-text-secondary">
              {isReady ? t('deviceSetup.capabilityTitle') : t('deviceSetup.capabilityMessage')}
            </Text>
          </View>
        ) : null}
        {isReady ? (
          <Button label={t('common.done')} className="mt-3" onPress={() => router.back()} />
        ) : null}
      </View>
    </Screen>
  );
}

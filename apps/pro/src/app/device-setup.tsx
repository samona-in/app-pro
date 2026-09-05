import { View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, Screen, Text } from '@/components/ui';
import { useDeviceReadiness } from '@/hooks';
import type { DeviceReadiness } from '@/services/device-readiness-state';
import {
  getDeviceManufacturer,
  openBackgroundDataSettings,
  openNotificationSettings,
  requestIgnoreBatteryOptimization,
} from '@/services/device-readiness';
import { requestFullScreenIntent } from '@/services/full-screen-alert';

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
  title: string;
  description: string;
  fix: () => Promise<boolean> | boolean;
}

const ITEMS: ReadinessItem[] = [
  {
    key: 'notificationsEnabled',
    title: 'Notifications',
    description:
      "Job alerts arrive as notifications. On Android 14+, also allow the full-screen toggle so a request covers whatever you're doing.",
    fix: openNotificationSettings,
  },
  {
    key: 'fullScreenAlertsEnabled',
    title: 'Show alerts over other apps',
    description:
      'A new job request should appear on top of other apps even while the app is closed. Android 14+ requires the full-screen permission to be switched on.',
    fix: requestFullScreenIntent,
  },
  {
    key: 'batteryOptimizationIgnored',
    title: 'Battery — unrestricted',
    description:
      'Battery optimisation can stop the alert from ever arriving. Set Samona Pro to "Unrestricted" under Battery.',
    fix: requestIgnoreBatteryOptimization,
  },
  {
    key: 'backgroundDataAllowed',
    title: 'Background data',
    description:
      'With background data restricted, a phone left untouched may never receive a job alert until you open the app again.',
    fix: openBackgroundDataSettings,
  },
];

function oemGuide(manufacturer: string): string {
  const brand = manufacturer.toLowerCase();
  if (brand.includes('xiaomi') || brand.includes('redmi')) {
    return 'MiUI: Settings → Apps → Manage apps → Samona Pro → Autostart → On. Also Settings → Battery → Background app limits → No restrictions, and remove Samona Pro from any "battery saver" list.';
  }
  if (brand.includes('samsung')) {
    return 'One UI: Settings → Battery → Background usage limits → Never sleeping apps → Add Samona Pro. Also remove it from "Sleeping apps" and "Deep sleeping apps".';
  }
  if (brand.includes('oneplus')) {
    return 'OxygenOS: Settings → Battery → Battery optimization → Samona Pro → Don\'t optimize. Under Apps → Samona Pro → Battery usage, enable "Run in background".';
  }
  if (brand.includes('oppo') || brand.includes('vivo') || brand.includes('realme')) {
    return 'ColorOS/OriginOS: Settings → Apps → Samona Pro → Battery → Allow background activity. If a "Autostart" list exists, enable it there too.';
  }
  if (brand.includes('nothing') || brand.includes('google') || brand.includes('motorola')) {
    return 'Near-stock Android: the four checks above are all that matters. If alerts still stop while the app is closed, check the OEM battery app for a "sleeping apps" list.';
  }
  return 'Every OEM tweaks this differently. Ensure Samona Pro is not inside a "sleeping apps", "deep sleep" or autostart restriction list under Battery in your phone settings.';
}

function checklistRow(item: ReadinessItem, ok: boolean) {
  return (
    <Card key={item.key} className="mt-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text variant="bodyLg" className="font-semibold">
            {item.title}
          </Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            {item.description}
          </Text>
        </View>
        <Badge label={ok ? 'On' : 'Off'} tone={ok ? 'success' : 'warning'} withDot />
      </View>
      {!ok ? (
        <Button
          variant="secondary"
          size="sm"
          label="Fix"
          className="mt-3"
          haptic={false}
          onPress={() => void item.fix()}
        />
      ) : null}
    </Card>
  );
}

export default function DeviceSetup() {
  const { readiness, isReady, refreshDeviceReadiness } = useDeviceReadiness();

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">Job alert setup</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          These settings let Samona show new job requests even when the app is closed or the screen
          is off. Review each one below.
        </Text>
      </View>

      {isReady ? (
        <Card className="mt-6 border border-success bg-success-surface">
          <Text variant="bodyLg" className="font-semibold text-success">
            All set
          </Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            Your phone is set up to receive job alerts while the app is closed.
          </Text>
        </Card>
      ) : (
        <View className="mt-2">
          {readiness === null ? (
            <Text variant="footnote" className="mt-6 text-center text-text-muted">
              Checking your phone settings…
            </Text>
          ) : (
            ITEMS.map((item) => checklistRow(item, readiness[item.key]))
          )}
        </View>
      )}

      <Card className="mt-6 bg-surface-muted">
        <Badge label="For your phone" tone="info" />
        <Text variant="body" className="mt-3 font-semibold">
          Keep Samona Pro out of sleep
        </Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          Some phones put unused apps to sleep, which stops job alerts. We can't check or change
          this from the app — set it once in your phone settings.
        </Text>
        <Text variant="footnote" className="mt-3 text-text-secondary">
          {oemGuide(getDeviceManufacturer())}
        </Text>
      </Card>

      <View className="mt-8">
        <Button
          variant="secondary"
          label="Check again"
          haptic={false}
          onPress={() => void refreshDeviceReadiness()}
        />
        {isReady ? <Button label="Done" className="mt-3" onPress={() => router.back()} /> : null}
      </View>
    </Screen>
  );
}

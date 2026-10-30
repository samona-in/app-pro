import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useDeviceReadiness } from '@/hooks';
import { missingReadinessCount } from '@/services/device-readiness-state';
import { color } from '@/theme';

/**
 * Floating stack above the map. It is `box-none` so the map keeps every pan and
 * pinch that does not land on a banner, and it never covers the sheet because
 * the sheet is rendered after it.
 */
export function HomeBanners({ children }: { children: ReactNode }) {
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 gap-2 px-4 pt-3"
    >
      {children}
    </View>
  );
}

/**
 * Always-visible route to the device fix-it screen while offline. The hard gate
 * inside `goOnline` already blocks a deaf pro from going online; this keeps the
 * fix discoverable before they try.
 */
export const ReadinessBanner = memo(function ReadinessBanner({
  isOnline,
}: {
  isOnline: boolean;
}) {
  const { t } = useTranslation();
  const { readiness, isReady } = useDeviceReadiness();

  if (isOnline || readiness === null || isReady) return null;

  const missing = missingReadinessCount(readiness);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('home.readiness.title')}. ${t('home.readiness.fixAction')}`}
      onPress={() => router.push('/device-setup')}
      className="min-h-[56px] flex-row items-center rounded-xl border border-warning bg-warning-surface px-3.5 py-2.5 active:opacity-80"
    >
      <View className="h-8 w-8 items-center justify-center rounded-full bg-warning/15">
        <Ionicons name="alert-circle" size={18} color={color.warning} />
      </View>
      <View className="ml-3 flex-1 pr-2">
        <Text variant="caption" className="font-semibold text-warning" numberOfLines={1}>
          {t('home.readiness.title')}
        </Text>
        <Text variant="caption" className="text-text-secondary" numberOfLines={2}>
          {t('home.readiness.manySettings', { count: missing })} {t('home.readiness.fixAction')}
        </Text>
      </View>
      <Text variant="caption" className="font-semibold text-warning">
        {t('home.fix')}
      </Text>
    </Pressable>
  );
});

/**
 * A quiet live entry back into the combined requests list while offers are
 * pending, so a request is never trapped behind a dismissed screen.
 */
export const IncomingRequestsBanner = memo(function IncomingRequestsBanner({
  count,
}: {
  count: number;
}) {
  const { t } = useTranslation();
  if (count === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('dashboard.incoming.title')}. ${t('home.incomingRequests.review')}`}
      onPress={() => router.push('/incoming-jobs')}
      className="min-h-[56px] flex-row items-center rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 active:opacity-80"
    >
      <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name="file-tray-full" size={18} color={color.brand} />
      </View>
      <View className="ml-3 flex-1 pr-2">
        <Text variant="caption" className="font-semibold text-brand" numberOfLines={1}>
          {t('dashboard.incoming.title')}
        </Text>
        <Text variant="caption" className="text-text-secondary" numberOfLines={1}>
          {t('dashboard.incoming.waiting', { count })}
        </Text>
      </View>
      <View className="min-h-[32px] justify-center rounded-full bg-brand px-3">
        <Text variant="caption" className="font-semibold text-brand-contrast">
          {t('home.incomingRequests.review')}
        </Text>
      </View>
    </Pressable>
  );
});

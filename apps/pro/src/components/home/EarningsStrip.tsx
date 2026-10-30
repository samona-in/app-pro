import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { formatInr } from '@/utils/format';
import type { TodayEarningsSummary } from '@/utils/earnings';
import { color } from '@/theme';

export interface EarningsStripProps {
  summary: TodayEarningsSummary;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  onOpenEarnings?: () => void;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text variant="caption" className="text-text-secondary">
        {label}
      </Text>
      <Text variant="bodyStrong" className="mt-0.5" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * The compact "today" strip under the header. Collapsed it is one glanceable
 * amount; tapped it reveals the same figures broken into jobs, settled and
 * pending payouts. Every value comes from the pro's own jobs — there is no
 * hardcoded money anywhere in this component.
 */
export function EarningsStrip({
  summary,
  isLoading,
  isError,
  onRetry,
  onOpenEarnings,
}: EarningsStripProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const amountLabel = isLoading
    ? t('dashboard.earnings.loadingShort')
    : formatInr(summary.earningsPaise);

  return (
    // The strip keeps a constant height in the layout; the details drawer is
    // lifted out of flow (absolute, below the row) and raised above the map, so
    // opening it never resizes the map or moves the bottom sheet.
    <Animated.View
      layout={LinearTransition.duration(180)}
      className="border-b border-border bg-brand-soft"
      style={{ zIndex: 100 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${t('dashboard.earnings.title')}, ${amountLabel}`}
        onPress={() => setExpanded((value) => !value)}
        className="min-h-[60px] flex-row items-center justify-between bg-brand px-5 active:opacity-80"
      >
        <View className="flex-row items-center">
          <Ionicons name="wallet-outline" size={18} color={color['brand-contrast']} />
          <Text variant="bodyStrong" className="ml-2 text-brand-contrast">
            {t('dashboard.earnings.title')}
          </Text>
        </View>

        <View className="flex-row items-center">
          {isLoading ? (
            <ActivityIndicator size="small" color={color['brand-contrast']} />
          ) : (
            <Text variant="title" className="text-brand-contrast">
              {isError ? t('common.dash') : amountLabel}
            </Text>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={color['brand-contrast']}
            style={{ marginLeft: 4 }}
          />
        </View>
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOutUp.duration(120)}
          className="absolute inset-x-0 border-t border-border bg-brand-soft px-5 pb-3 pt-3"
          style={{
            top: '100%',
            elevation: 12,
            shadowColor: color['text-primary'],
            shadowOpacity: 0.16,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          {isError ? (
            <View className="flex-row items-center justify-between">
              <Text variant="footnote" className="flex-1 pr-3">
                {t('dashboard.earnings.unavailable')}
              </Text>
              {onRetry ? (
                <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
                  <Text variant="footnote" className="font-semibold text-brand">
                    {t('dashboard.earnings.retry')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <View className="flex-row">
                <Metric
                  label={t('dashboard.earnings.today')}
                  value={formatInr(summary.earningsPaise)}
                />
                <Metric
                  label={t('dashboard.earnings.completed')}
                  value={String(summary.completedJobs)}
                />
                <Metric
                  label={t('dashboard.earnings.pending')}
                  value={formatInr(summary.pendingPayoutPaise)}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setExpanded(false);
                  onOpenEarnings?.();
                }}
                className="mt-2 self-start py-1"
                disabled={!onOpenEarnings}
              >
                <Text variant="footnote" className="font-semibold text-brand">
                  {t('dashboard.earnings.viewAll')}
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

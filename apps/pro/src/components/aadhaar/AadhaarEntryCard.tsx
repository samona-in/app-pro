import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export type AadhaarFlowSource = 'onboarding' | 'profile';

export interface AadhaarEntryCardProps {
  /** Where the flow was opened from, passed on as a non-sensitive param. */
  source: AadhaarFlowSource;
  className?: string;
}

/**
 * The Aadhaar shortcut on Profile > Documents.
 *
 * Onboarding asks for Aadhaar directly; this is the way to add it from the
 * profile afterwards. It sits beside the general file picker rather than
 * replacing it: Aadhaar is one convenient way to satisfy the ID-proof
 * requirement, not a separate verification product. The source screen is the
 * only thing carried in the route params — image data never leaves the
 * in-memory store.
 */
export function AadhaarEntryCard({ source, className }: AadhaarEntryCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('aadhaar.entry.a11y')}
      onPress={() => router.push({ pathname: '/aadhaar', params: { source } })}
      className={cn(
        'flex-row items-center rounded-xl border border-border bg-surface-tint p-4 active:opacity-80',
        className,
      )}
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name="card-outline" size={24} color={color.brand} />
      </View>

      <View className="ml-3 flex-1">
        <View className="flex-row items-center">
          <Text variant="body" className="font-semibold">
            {t('aadhaar.entry.title')}
          </Text>
          <View className="ml-2 rounded-full bg-brand px-2 py-0.5">
            <Text variant="caption" className="font-semibold text-text-inverse">
              {t('aadhaar.entry.badge')}
            </Text>
          </View>
        </View>
        <Text variant="footnote" className="mt-0.5 text-text-secondary">
          {t('aadhaar.entry.subtitle')}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={color['text-muted']} />
    </Pressable>
  );
}

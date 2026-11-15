import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@/components/ui';
import { color } from '@/theme';

/**
 * Home's "complete your profile" prompt.
 *
 * Shown in the sheet instead of the services block while the profile is either
 * unfinished or still under review. The caller passes the destination computed
 * from the profile's own completion state (onboarding resume point, Documents,
 * or the read-only verification status), so the CTA drops the Pro back exactly
 * where they stopped instead of re-deriving the decision here.
 */
export function CompleteProfileCard({ nextRoute }: { nextRoute?: Href | null }) {
  const { t } = useTranslation();

  return (
    <View className="rounded-xl bg-brand-soft px-4 py-3">
      <View className="flex-row items-center">
        <Ionicons name="person-circle-outline" size={20} color={color.brand} />
        <Text variant="title" className="ml-2 flex-1">
          {t('dashboard.sheet.completeProfileTitle')}
        </Text>
      </View>
      <Text variant="footnote" className="mt-1 pr-1">
        {t('dashboard.sheet.completeProfileBody')}
      </Text>
      <Button
        label={t('dashboard.sheet.completeProfileCta')}
        size="sm"
        onPress={() => router.push(nextRoute ?? '/onboarding/intro')}
        className="mt-3"
      />
    </View>
  );
}

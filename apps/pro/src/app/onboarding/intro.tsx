import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Text } from '@/components/ui';
import type { TranslationKey } from '@/i18n';
import { color } from '@/theme';

const PROMISES: { icon: 'briefcase-outline' | 'map-outline' | 'wallet-outline'; tKey: TranslationKey }[] = [
  { icon: 'briefcase-outline', tKey: 'onboarding.intro.promiseJobs' },
  { icon: 'map-outline', tKey: 'onboarding.intro.promiseArea' },
  { icon: 'wallet-outline', tKey: 'onboarding.intro.promisePay' },
];

export default function OnboardingIntro() {
  const { t } = useTranslation();
  return (
    <OnboardingStepLayout
      step="intro"
      title={t('onboarding.intro.title')}
      subtitle={t('onboarding.intro.subtitle')}
      primaryLabel={t('onboarding.intro.getStarted')}
      onPrimary={() => router.push('/onboarding/name')}
    >
      <View className="gap-6 pt-2">
        {PROMISES.map((item) => (
          <View key={item.tKey} className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
              <Ionicons name={item.icon} size={20} color={color.brand} />
            </View>
            <Text variant="body" className="ml-4 flex-1 text-text-primary">
              {t(item.tKey)}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" className="mt-10 text-text-muted">
        {t('onboarding.intro.durationNote')}
      </Text>
    </OnboardingStepLayout>
  );
}
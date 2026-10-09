import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Screen, Text } from '@/components/ui';
import { activeLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { color } from '@/theme';

const VALUE_PROPS: { tKey: 'welcome.valueProps.jobRequests' | 'welcome.valueProps.acceptWork' | 'welcome.valueProps.trackEarnings' }[] = [
  { tKey: 'welcome.valueProps.jobRequests' },
  { tKey: 'welcome.valueProps.acceptWork' },
  { tKey: 'welcome.valueProps.trackEarnings' },
];

export default function Welcome() {
  const { t } = useTranslation();
  const languageName = SUPPORTED_LANGUAGES.find((l) => l.code === activeLanguage())?.nativeName;

  /**
   * Both buttons lead to the same place: a professional entering their number
   * does not know whether they already have an account, and Supabase creates
   * one on first verification, so the phone flow resolves it either way.
   */
  function continueToPhone() {
    router.push('/phone');
  }

  return (
    <Screen edges={['top', 'bottom']} className="bg-surface">
      <View className="flex-row justify-end pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('language.title')}
          onPress={() => router.push('/language')}
          className="flex-row items-center gap-1.5 rounded-full border border-border px-3 py-1.5 active:opacity-60"
        >
          <Ionicons name="globe-outline" size={16} color={color['text-secondary']} />
          <Text variant="footnote" className="font-semibold text-text-secondary">
            {languageName}
          </Text>
        </Pressable>
      </View>

      <View className="flex-1 justify-center">
        <Wordmark size="lg" />

        <Text variant="titleLg" className="mt-8">
          {t('welcome.heading')}
        </Text>
        <Text variant="bodyLg" className="mt-3 text-text-secondary">
          {t('welcome.subheading')}
        </Text>

        <View className="mt-10 gap-4">
          {VALUE_PROPS.map((item) => (
            <View key={item.tKey} className="flex-row items-start">
              <View className="mr-3 mt-2 h-1.5 w-1.5 rounded-full bg-brand" />
              <Text variant="body" className="flex-1 text-text-secondary">
                {t(item.tKey)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-3 pb-4">
        <Button label={t('welcome.getStarted')} size="lg" onPress={continueToPhone} />
        <Button label={t('welcome.haveAccount')} variant="ghost" onPress={continueToPhone} />
        <Text variant="caption" className="mt-2 text-center">
          {t('welcome.otpVerify', { otpLength: OTP_LENGTH })}
        </Text>
      </View>
    </Screen>
  );
}

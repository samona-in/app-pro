import { View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { LanguagePicker, Screen, Text } from '@/components/ui';
import { activeLanguage, changeAppLanguage, type AppLanguage } from '@/i18n';

/**
 * Language picker — a modal reached from the Profile settings (and the welcome
 * screen pre-auth). Switching applies immediately and is persisted so it
 * survives restarts and re-sign-ins.
 */
export default function LanguageScreen() {
  const { t } = useTranslation();

  async function onSelect(language: AppLanguage) {
    if (language === activeLanguage()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await changeAppLanguage(language);
    router.back();
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">{t('language.title')}</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('language.subtitle')}
        </Text>
      </View>

      <View className="mt-4">
        <LanguagePicker selected={activeLanguage()} onSelect={(code) => void onSelect(code)} />
      </View>
    </Screen>
  );
}

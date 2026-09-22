import { View } from 'react-native';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Card, Divider, Screen, Text } from '@/components/ui';
import { changeAppLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n';
import { color } from '@/theme';

/**
 * Language picker — a modal reached from the Profile settings. Switching is
 * instant (react-i18next re-renders subscribers) and the choice is persisted
 * so it survives restarts and re-sign-ins.
 */
export default function LanguageScreen() {
  const { t, i18n } = useTranslation();

  async function onSelect(language: AppLanguage) {
    if (i18n.language === language) return;
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

      <Card className="mt-4" padded={false}>
        {SUPPORTED_LANGUAGES.map(({ code, nativeName }, index) => {
          const active = i18n.language === code;
          return (
            <View key={code}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={active ? { selected: true } : undefined}
                accessibilityLabel={nativeName}
                className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
                onPress={() => void onSelect(code)}
              >
                <Text variant="body" className="flex-1 font-semibold">
                  {nativeName}
                </Text>
                {active ? <Ionicons name="checkmark" size={22} color={color.brand} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
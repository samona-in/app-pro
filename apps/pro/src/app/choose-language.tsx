import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, LanguagePicker, Screen, Text } from '@/components/ui';
import { activeLanguage, changeAppLanguage, type AppLanguage } from '@/i18n';

/**
 * First-launch language step, shown once before the welcome screen when the Pro
 * has never chosen a language (see the entry route's gate).
 *
 * Device language is pre-selected, but nothing is committed until Continue:
 * tapping a language only moves the checkmark, so the Pro can look before they
 * leap. Continue persists the choice and hands off to the normal auth flow.
 */
export default function ChooseLanguage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AppLanguage>(activeLanguage);
  const [saving, setSaving] = useState(false);

  async function onContinue() {
    setSaving(true);
    await changeAppLanguage(selected);
    router.replace('/welcome');
  }

  return (
    <Screen edges={['top', 'bottom']} className="bg-surface">
      <View className="flex-1 justify-center">
        <Text variant="titleLg">{t('chooseLanguage.title')}</Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          {t('chooseLanguage.subtitle')}
        </Text>

        <View className="mt-8">
          <LanguagePicker selected={selected} onSelect={setSelected} />
        </View>
      </View>

      <View className="pb-4">
        <Button
          label={t('common.continue')}
          size="lg"
          loading={saving}
          onPress={() => void onContinue()}
        />
      </View>
    </Screen>
  );
}

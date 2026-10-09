import { useState } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, LanguagePicker, Text } from '@/components/ui';
import { activeLanguage, changeAppLanguage, previewLanguage, type AppLanguage } from '@/i18n';
import { cn } from '@/utils/cn';
import { elevation } from '@/theme';

interface HeroBubble {
  label: string;
  size: number;
  fontSize: number;
  brand: boolean;
  style: ViewStyle;
}

/** Three floating language bubbles over the SAMONA-blue hero. */
const HERO_BUBBLES: HeroBubble[] = [
  {
    label: 'A',
    size: 80,
    fontSize: 34,
    brand: false,
    style: { top: '15%', left: '16%', transform: [{ rotate: '-6deg' }] },
  },
  {
    label: 'తెలుగు',
    size: 116,
    fontSize: 26,
    brand: true,
    style: { top: '22%', right: '9%', transform: [{ rotate: '6deg' }] },
  },
  {
    label: 'हिन्दी',
    size: 88,
    fontSize: 26,
    brand: false,
    style: { bottom: '18%', left: '32%', transform: [{ rotate: '-4deg' }] },
  },
];

/** Decorative hero. Layered translucent circles stand in for a soft gradient. */
function LanguageHero() {
  return (
    <View className="flex-1 overflow-hidden">
      <View className="absolute -right-16 -top-12 h-64 w-64 rounded-full bg-white/50" />
      <View className="absolute -left-20 top-24 h-56 w-56 rounded-full bg-brand/10" />
      <View className="absolute -bottom-16 right-12 h-44 w-44 rounded-full bg-white/40" />

      {HERO_BUBBLES.map((bubble) => (
        <View
          key={bubble.label}
          style={[elevation.md, bubble.style, { width: bubble.size, height: bubble.size }]}
          className={cn(
            'absolute items-center justify-center rounded-full',
            bubble.brand ? 'bg-brand' : 'bg-surface',
          )}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            className={cn('font-bold', bubble.brand ? 'text-brand-contrast' : 'text-brand')}
            style={{ fontSize: bubble.fontSize, lineHeight: bubble.fontSize * 1.25 }}
          >
            {bubble.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * First-launch language step, shown once before the welcome screen when the Pro
 * has never chosen a language (see the entry route's gate).
 *
 * Device language is pre-selected, but nothing is committed until Continue:
 * tapping a card only moves the selection, so the Pro can look before they leap.
 * Continue persists the choice and hands off to the normal auth flow.
 */
export default function ChooseLanguage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AppLanguage>(activeLanguage);
  const [saving, setSaving] = useState(false);

  // Preview the tapped language immediately (heading, copy, button) without
  // committing it; Continue is what persists and advances.
  function onSelect(language: AppLanguage) {
    setSelected(language);
    void previewLanguage(language);
  }

  async function onContinue() {
    setSaving(true);
    await changeAppLanguage(selected);
    router.replace('/welcome');
  }

  return (
    <View className="flex-1 bg-brand-soft">
      <View className="h-[36%]">
        <SafeAreaView edges={['top']} className="flex-1">
          <LanguageHero />
        </SafeAreaView>
      </View>

      <View className="-mt-7 flex-1 rounded-t-[32px] bg-surface px-5 pb-4 pt-7">
        <Text variant="titleLg">{t('chooseLanguage.title')}</Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          {t('chooseLanguage.subtitle')}
        </Text>

        <ScrollView
          className="mt-6 flex-1"
          contentContainerClassName="grow pb-2"
          showsVerticalScrollIndicator={false}
        >
          <LanguagePicker variant="cards" selected={selected} onSelect={onSelect} />
        </ScrollView>

        <View className="pt-4">
          <Button
            label={t('common.continue')}
            size="lg"
            loading={saving}
            onPress={() => void onContinue()}
          />
        </View>
      </View>

      <SafeAreaView edges={['bottom']} className="bg-surface" />
    </View>
  );
}

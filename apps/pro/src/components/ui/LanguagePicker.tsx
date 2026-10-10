import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { Divider } from './Divider';
import { Text } from './Text';

const LANGUAGE_GLYPHS: Record<AppLanguage, string> = { en: 'A', te: 'అ', hi: 'अ' };

export interface LanguagePickerProps {
  /** The currently highlighted language. Selection never navigates or persists. */
  selected: AppLanguage;
  /** Called with the tapped language; the caller decides what to do with it. */
  onSelect: (language: AppLanguage) => void;
  /** `list` for the settings modal; `cards` for the first-launch onboarding step. */
  variant?: 'list' | 'cards';
}

/**
 * Language selection shared by the first-launch step and the Profile settings
 * modal. Purely presentational: it renders the supported languages and reports
 * taps, so the two screens differ only in variant and on what to do with the
 * choice (confirm-then-continue vs. apply now).
 */
export function LanguagePicker({ selected, onSelect, variant = 'list' }: LanguagePickerProps) {
  return variant === 'cards' ? (
    <LanguageCards selected={selected} onSelect={onSelect} />
  ) : (
    <LanguageList selected={selected} onSelect={onSelect} />
  );
}

interface LanguageListProps {
  selected: AppLanguage;
  onSelect: (language: AppLanguage) => void;
}

function LanguageList({ selected, onSelect }: LanguageListProps) {
  return (
    <View>
      {SUPPORTED_LANGUAGES.map(({ code, nativeName }, index) => {
        const active = selected === code;
        return (
          <View key={code}>
            {index > 0 ? <Divider className="-mx-5" /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={active ? { selected: true } : undefined}
              accessibilityLabel={nativeName}
              className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
              onPress={() => onSelect(code)}
            >
              <Text variant="body" className="flex-1 font-semibold">
                {nativeName}
              </Text>
              {active ? <Ionicons name="checkmark" size={22} color={color.brand} /> : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

interface LanguageCardsProps {
  selected: AppLanguage;
  onSelect: (language: AppLanguage) => void;
}

/**
 * Card list for onboarding: one full-width card per language, icon on the left
 * and a radio on the right. Every card keeps the same white surface — selection
 * only moves the border and the radio, never a fill.
 */
function LanguageCards({ selected, onSelect }: LanguageCardsProps) {
  return (
    <View className="gap-3">
      {SUPPORTED_LANGUAGES.map(({ code, nativeName }) => {
        const active = selected === code;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={nativeName}
            onPress={() => onSelect(code)}
            className={cn(
              'min-h-[72px] flex-row items-center rounded-2xl border bg-surface p-4 active:opacity-80',
              active ? 'border-brand' : 'border-border',
            )}
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-background">
              <Text variant="bodyLg" className="font-bold text-brand">
                {LANGUAGE_GLYPHS[code]}
              </Text>
            </View>
            <Text variant="body" className="ml-4 flex-1 font-semibold" numberOfLines={1}>
              {nativeName}
            </Text>
            <SelectionRadio selected={active} />
          </Pressable>
        );
      })}
    </View>
  );
}

function SelectionRadio({ selected }: { selected: boolean }) {
  return (
    <View
      className={cn(
        'h-[22px] w-[22px] items-center justify-center rounded-full border-2',
        selected ? 'border-brand' : 'border-border-strong',
      )}
    >
      {selected ? <View className="h-[10px] w-[10px] rounded-full bg-brand" /> : null}
    </View>
  );
}

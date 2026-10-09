import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n';
import { color } from '@/theme';
import { Card } from './Card';
import { Divider } from './Divider';
import { Text } from './Text';

export interface LanguagePickerProps {
  /** The currently highlighted language. Selection never navigates or persists. */
  selected: AppLanguage;
  /** Called with the tapped language; the caller decides what to do with it. */
  onSelect: (language: AppLanguage) => void;
}

/**
 * Language list shared by the first-launch step and the Profile settings modal.
 * Purely presentational: it renders the supported languages and reports taps, so
 * the two screens can differ on persistence (confirm-then-continue vs. apply now)
 * without duplicating the rows.
 */
export function LanguagePicker({ selected, onSelect }: LanguagePickerProps) {
  return (
    <Card padded={false}>
      {SUPPORTED_LANGUAGES.map(({ code, nativeName }, index) => {
        const active = selected === code;
        return (
          <View key={code}>
            {index > 0 ? <Divider /> : null}
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
    </Card>
  );
}

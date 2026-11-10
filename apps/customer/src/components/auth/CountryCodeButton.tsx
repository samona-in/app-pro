import { Keyboard, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { Country } from '@/constants/countries';
import { Text } from '@/components/ui';
import { color } from '@/theme';

/** Flags come in slightly different aspect ratios, so they sit in a fixed box
 *  with `contain` instead of being stretched to one ratio. */
const FLAG_WIDTH = 26;
const FLAG_HEIGHT = 18;

export interface CountryCodeButtonProps {
  country: Country;
  /** Mirrors the sheet's open state for screen readers. */
  expanded?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * The flag + dial-code box on the phone login. Tapping it opens the country
 * list in a bottom sheet (`CountryPickerSheet`), which the host screen owns.
 *
 * The keyboard is dropped before opening so the sheet has the full screen to
 * rise over; the typed number is kept as-is.
 */
export function CountryCodeButton({
  country,
  expanded = false,
  disabled = false,
  onPress,
}: CountryCodeButtonProps) {
  return (
    <Pressable
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="combobox"
      accessibilityLabel={`Country code: ${country.name}, plus ${country.dial}`}
      accessibilityState={{ expanded }}
      className="h-14 flex-row items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 active:opacity-60"
    >
      <Image
        source={country.flag}
        style={{ width: FLAG_WIDTH, height: FLAG_HEIGHT }}
        contentFit="contain"
        accessible={false}
      />
      <Text variant="bodyLg" className="font-bold text-text-primary">
        +{country.dial}
      </Text>
      <Ionicons name="chevron-down" size={14} color={color['text-secondary']} />
    </Pressable>
  );
}

import { Pressable, View } from 'react-native';
import type { AddressLabel } from '@samona/types';
import { Text } from '@/components/ui';
import { ADDRESS_LABEL_NAMES } from '@/utils/address';
import { cn } from '@/utils/cn';

interface SaveAsLabelPickerProps {
  value: AddressLabel;
  onChange: (label: AddressLabel) => void;
}

/** The three "Save as" choices — Home starts selected. */
const LABEL_CHOICES: AddressLabel[] = ['HOME', 'WORK', 'OTHER'];

/**
 * Home / Work / Other pill group for labelling a saved address.
 *
 * Shared by the confirm screen when creating and the edit sheet when renaming
 * an existing address's label.
 */
export function SaveAsLabelPicker({ value, onChange }: SaveAsLabelPickerProps) {
  return (
    <View className="flex-row gap-2">
      {LABEL_CHOICES.map((choice) => {
        const selected = value === choice;
        return (
          <Pressable
            key={choice}
            accessibilityRole="button"
            accessibilityLabel={`Save as ${ADDRESS_LABEL_NAMES[choice]}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(choice)}
            className={cn(
              'min-h-[44px] flex-1 items-center justify-center rounded-full border',
              selected ? 'border-brand bg-brand' : 'border-border bg-background',
            )}
          >
            <Text
              variant="body"
              className={cn('font-semibold', selected ? 'text-white' : 'text-text-secondary')}
            >
              {ADDRESS_LABEL_NAMES[choice]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
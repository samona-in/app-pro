import { Pressable, View } from 'react-native';
import { elevation } from '@/theme';
import { cn } from '@/utils/cn';
import { Text } from './Text';

export interface SegmentedControlProps<T extends string> {
  /** The options, in display order. */
  options: readonly T[];
  /** The option currently selected. */
  value: T;
  /** Called with the newly selected option. */
  onChange: (value: T) => void;
  className?: string;
}

/**
 * An iOS-style segmented control: a muted track with a raised white thumb
 * behind the selected label.
 *
 * The thumb is the selected segment's own background rather than a separate
 * animated view, so the control renders in one pass and needs no measurement.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <View className={cn('flex-row rounded-md bg-surface-muted p-0.5', className)}>
      {options.map((option) => {
        const isSelected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option)}
            style={isSelected ? elevation.sm : undefined}
            className={cn(
              'flex-1 items-center justify-center rounded-[8px] py-1.5',
              isSelected && 'bg-surface',
            )}
          >
            <Text
              variant="footnote"
              className={cn(
                'font-semibold',
                isSelected ? 'text-text-primary' : 'text-text-secondary',
              )}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

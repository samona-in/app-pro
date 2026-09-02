import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface SelectableCardProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Renders a radio affordance instead of a checkbox. */
  single?: boolean;
}

/**
 * One selectable option on the light onboarding surface. Defaults to a muted
 * border card; selecting fills it with SAMONA blue with white text.
 */
export function SelectableCard({
  label,
  selected,
  onToggle,
  icon,
  single = false,
}: SelectableCardProps) {
  return (
    <Pressable
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onToggle}
      className={cn(
        'min-h-[56px] flex-row items-center rounded-[5px] border px-4 py-3 active:opacity-70',
        selected ? 'border-brand bg-brand' : 'border-border bg-surface',
      )}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={20}
          color={selected ? color['brand-contrast'] : color['text-secondary']}
        />
      ) : null}

      <Text
        variant={selected ? 'bodyStrong' : 'body'}
        className={cn('flex-1', icon && 'ml-3', selected && 'text-white')}
      >
        {label}
      </Text>

      <View
        className={cn(
          'ml-3 h-5 w-5 items-center justify-center border',
          single ? 'rounded-full' : 'rounded',
          selected ? 'border-brand-contrast' : 'border-border-strong',
        )}
      >
        {selected ? <Ionicons name="checkmark" size={14} color={color['brand-contrast']} /> : null}
      </View>
    </Pressable>
  );
}

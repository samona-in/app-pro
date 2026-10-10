import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ServiceImage } from '@/components/services/ServiceImage';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface SelectableCardProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Service image thumbnail, rendered instead of `icon` when set. */
  imageUri?: string | null;
  /** Renders a radio affordance instead of a checkbox. */
  single?: boolean;
}

/**
 * One selectable option on the light onboarding surface. A quiet bordered row
 * by default; selecting tints the surface soft brand and marks the box — the
 * same subtle treatment as the customer app, so the list reads clean rather
 * than blocking every choice with a filled blue card.
 */
export function SelectableCard({
  label,
  selected,
  onToggle,
  icon,
  imageUri,
  single = false,
}: SelectableCardProps) {
  return (
    <Pressable
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onToggle}
      className={cn(
        'min-h-[56px] flex-row items-center rounded-lg border px-4 py-3 active:opacity-70',
        selected ? 'border-brand bg-surface-muted' : 'border-border bg-surface',
      )}
    >
      {imageUri ? (
        <ServiceImage uri={imageUri} accessibilityLabel={label} className="h-7 w-7 rounded" />
      ) : icon ? (
        <Ionicons name={icon} size={20} color={selected ? color.brand : color['text-secondary']} />
      ) : null}

      <Text
        variant={selected ? 'bodyStrong' : 'body'}
        className={cn('flex-1', (icon || imageUri) && 'ml-3')}
      >
        {label}
      </Text>

      <View
        className={cn(
          'ml-3 h-5 w-5 items-center justify-center border',
          single ? 'rounded-full' : 'rounded',
          selected ? 'border-brand bg-brand' : 'border-border-strong',
        )}
      >
        {selected ? <Ionicons name="checkmark" size={14} color={color['brand-contrast']} /> : null}
      </View>
    </Pressable>
  );
}

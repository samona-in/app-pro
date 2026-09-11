import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AddressLabel } from '@samona/types';
import { Text } from '@/components/ui';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const LABEL_ICONS: Record<AddressLabel, IoniconName> = {
  HOME: 'home',
  WORK: 'briefcase',
  OTHER: 'location',
};

export interface AddressListItemProps {
  /** Which icon to lead with: a saved-address label or a plain pin. */
  icon?: AddressLabel | 'pin';
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  trailing?: ReactNode;
}

/**
 * A tappable address row: icon in a soft tile, the primary line, the area line,
 * and optional trailing content. Shared by the search, recent and saved lists.
 */
export function AddressListItem({
  icon = 'pin',
  title,
  subtitle,
  onPress,
  trailing,
}: AddressListItemProps) {
  const Inner = (
    <>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
        <Ionicons
          name={icon === 'pin' ? 'location' : LABEL_ICONS[icon]}
          size={18}
          color={icon === 'pin' ? color['text-secondary'] : color.brand}
        />
      </View>
      <View className="ml-3 flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" numberOfLines={1} className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );

  if (!onPress) {
    return <View className="flex-row py-3">{Inner}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row py-3 active:opacity-70"
    >
      {Inner}
    </Pressable>
  );
}
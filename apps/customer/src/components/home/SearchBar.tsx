import { Ionicons } from '@expo/vector-icons';
import { Pressable, type PressableProps } from 'react-native';
import { Text } from '@/components/ui';
import { elevation, color } from '@/theme';
import { cn } from '@/utils/cn';

export interface SearchBarProps extends Omit<PressableProps, 'style'> {
  placeholder?: string;
  className?: string;
}

/**
 * Tappable home search bar.
 *
 * A large white rounded field with a leading search icon. It opens search via
 * the parent's `onPress` rather than owning an editable input, which keeps the
 * home screen presentational and the actual search flow separate.
 */
export function SearchBar({
  placeholder = 'Search for services',
  onPress,
  className,
  ...rest
}: SearchBarProps) {
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      onPress={onPress}
      style={elevation.sm}
      className={cn(
        'min-h-[56px] flex-row items-center rounded-xl bg-surface px-4 active:opacity-80',
        className,
      )}
      {...rest}
    >
      <Ionicons name="search-outline" size={20} color={color['text-muted']} />
      <Text variant="body" className="ml-3 flex-1 text-text-muted">
        {placeholder}
      </Text>
    </Pressable>
  );
}

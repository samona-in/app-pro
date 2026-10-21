import { Ionicons } from '@expo/vector-icons';
import { Pressable, type PressableProps } from 'react-native';
import { Text } from '@/components/ui';
import { useTypedPlaceholder } from '@/hooks';
import { elevation, color } from '@/theme';
import { cn } from '@/utils/cn';

export interface SearchBarProps extends Omit<PressableProps, 'style'> {
  placeholder?: string;
  className?: string;
}

const PLACEHOLDER_PHRASES = ['electrician', 'plumber', 'carpenter'];

/**
 * Tappable home search bar.
 *
 * A large white rounded field with a leading search icon. It opens search via
 * the parent's `onPress` rather than owning an editable input, which keeps the
 * home screen presentational and the actual search flow separate. The label
 * is a living typewriter cycling through example services to hint at what the
 * customer can search for.
 */
export function SearchBar({
  placeholder = 'Search for',
  onPress,
  className,
  ...rest
}: SearchBarProps) {
  const typed = useTypedPlaceholder(PLACEHOLDER_PHRASES);

  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={`${placeholder} ${PLACEHOLDER_PHRASES.join(', ')}`}
      onPress={onPress}
      style={elevation.sm}
      className={cn(
        'min-h-[48px] flex-row items-center rounded-xl bg-surface px-3 active:opacity-80',
        className,
      )}
      {...rest}
    >
      <Ionicons name="search-outline" size={18} color={color['text-muted']} />
      <Text
        variant="body"
        className="ml-2 flex-1 text-text-muted"
        numberOfLines={1}
        ellipsizeMode="clip"
      >
        {`${placeholder} ${typed}`}
      </Text>
    </Pressable>
  );
}

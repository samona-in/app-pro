import { Image, View } from 'react-native';
import { Text } from './Text';
import { cn } from '@/utils/cn';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeStyles: Record<AvatarSize, { container: string; text: 'caption' | 'body' | 'title' }> = {
  sm: { container: 'h-8 w-8', text: 'caption' },
  md: { container: 'h-11 w-11', text: 'body' },
  lg: { container: 'h-16 w-16', text: 'title' },
  xl: { container: 'h-24 w-24', text: 'title' },
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, uri, size = 'md', className }: AvatarProps) {
  const styles = sizeStyles[size];

  return (
    <View
      accessibilityLabel={name}
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-surface-muted',
        styles.container,
        className,
      )}
    >
      {uri ? (
        <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
      ) : (
        <Text variant={styles.text} className="font-semibold text-text-secondary">
          {initialsFrom(name)}
        </Text>
      )}
    </View>
  );
}

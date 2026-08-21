import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { textVariants, type TextVariant } from '@/theme';
import { cn } from '@/utils/cn';

export interface TextProps extends RNTextProps {
  /** Position in the type scale. See `theme/typography.ts`. */
  variant?: TextVariant;
  className?: string;
}

/**
 * The only text primitive the app should use.
 *
 * Routing every string through the type scale keeps hierarchy consistent and
 * makes a scale change a one-file edit.
 */
export function Text({ variant = 'body', className, ...rest }: TextProps) {
  return <RNText className={cn(textVariants[variant], className)} {...rest} />;
}

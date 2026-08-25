import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { textVariants, type TextVariant } from '@/theme';
import { cn } from '@/utils/cn';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  className?: string;
}

export function Text({ variant = 'body', className, ...rest }: TextProps) {
  return <RNText className={cn(textVariants[variant], className)} {...rest} />;
}

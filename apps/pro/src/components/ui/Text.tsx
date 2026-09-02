import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { color, textVariants, type TextVariant } from '@/theme';
import { cn } from '@/utils/cn';

export interface TextProps extends RNTextProps {
  /** Position in the type scale. See `theme/typography.ts`. */
  variant?: TextVariant;
  className?: string;
}

/**
 * Every `text-*` utility that sets a colour, derived from the tokens so a new
 * colour is picked up automatically. Size utilities (`text-body`, …) are never
 * colour token names, so they cannot collide.
 */
const COLOR_UTILITIES = new Set(
  Object.entries(color).flatMap(([token, value]) =>
    typeof value === 'string'
      ? [`text-${token}`]
      : Object.keys(value).map((shade) => `text-${token}-${shade}`),
  ),
);

function hasColorOverride(className: string | undefined): boolean {
  if (className === undefined) return false;
  return className.split(/\s+/).some((cls) => {
    // Support opacity modifier forms like `text-white/60`.
    const base = cls.replace(/\/[0-9]+$/, '');
    return COLOR_UTILITIES.has(cls) || COLOR_UTILITIES.has(base);
  });
}

/**
 * The only text primitive the app should use.
 *
 * Routing every string through the type scale keeps hierarchy consistent and
 * makes a scale change a one-file edit.
 *
 * Tailwind resolves conflicting utilities by stylesheet order (colour
 * utilities are emitted alphabetically), not by className order, so a colour
 * passed via `className` would silently lose to the variant's baked-in colour
 * — near-black labels on the near-black primary button. When a caller supplies
 * their own colour, drop the variant's instead and let the override win.
 */
export function Text({ variant = 'body', className, ...rest }: TextProps) {
  const variantClasses = hasColorOverride(className)
    ? textVariants[variant]
        .split(' ')
        .filter((cls) => !COLOR_UTILITIES.has(cls))
        .join(' ')
    : textVariants[variant];

  return <RNText className={cn(variantClasses, className)} {...rest} />;
}

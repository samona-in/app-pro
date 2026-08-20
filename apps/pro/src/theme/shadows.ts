import type { ViewStyle } from 'react-native';
import { colors } from './tokens';

/**
 * React Native elevation presets.
 *
 * Tailwind's `boxShadow` tokens cover web; native needs the shadow split into
 * iOS (`shadowX`) and Android (`elevation`) properties, so both are derived
 * from the same visual intent here.
 */
export const elevation: Record<'none' | 'sm' | 'md' | 'lg', ViewStyle> = {
  none: {},
  sm: {
    shadowColor: colors.ink[900],
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: colors.ink[900],
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  lg: {
    shadowColor: colors.ink[900],
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
};

export type { ShadowToken } from './tokens';

import { colors } from './tokens';

/**
 * Semantic colours for code that cannot use Tailwind classes — status-bar
 * config, navigation options, chart fills, `ActivityIndicator` tints.
 *
 * Prefer `className="bg-surface"` in components; reach for this only when a
 * raw colour value is genuinely required.
 */
export const color = colors;

export type { ColorTokens } from './tokens';

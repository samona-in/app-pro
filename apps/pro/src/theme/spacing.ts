import { spacing, minTouchTarget } from './tokens';

export const space = spacing;

/**
 * Minimum touch target in points. Every interactive component must be at least
 * this tall (CLAUDE.md "UI" — accessible touch targets).
 */
export const MIN_TOUCH_TARGET = minTouchTarget;

export type { SpacingToken } from './tokens';

/**
 * SAMONA Pro design tokens — the single source of truth for the design system.
 *
 * This file is CommonJS because `tailwind.config.js` requires it at build time.
 * TypeScript consumes the same values through `src/theme/index.ts`, so a token
 * change lands in Tailwind classes and StyleSheet values at once.
 *
 * BRANDING: a deliberately neutral, near-monochrome treatment stands in until
 * SAMONA branding is finalised. To rebrand, change `palette.brand` and the
 * semantic `color` aliases below — no component should need editing.
 */

/** Raw palette. Prefer the semantic `color` aliases in application code. */
const palette = {
  // Neutral ink scale — doubles as the temporary brand colour.
  ink: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#020617',
  },
  green: { 50: '#ECFDF5', 100: '#D1FAE5', 500: '#10B981', 600: '#059669', 700: '#047857' },
  amber: { 50: '#FFFBEB', 100: '#FEF3C7', 500: '#F59E0B', 600: '#D97706', 700: '#B45309' },
  red: { 50: '#FEF2F2', 100: '#FEE2E2', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C' },
  blue: {
    50: '#EAF0FC',
    100: '#D6E1F8',
    200: '#ADC4F1',
    300: '#7EA3E8',
    400: '#4D7DDD',
    500: '#1D57D0',
    600: '#054DFF',
    700: '#053FCC',
    800: '#043399',
    900: '#032766',
  },
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

/**
 * Semantic colours. Components reference these, never `palette` directly, so
 * rebranding is a change in one place.
 */
const colors = {
  ...palette,

  // Surfaces
  background: palette.ink[50],
  surface: palette.white,
  'surface-muted': palette.ink[100],
  'surface-inverse': palette.ink[900],

  // Text
  'text-primary': palette.ink[900],
  'text-secondary': palette.ink[500],
  'text-muted': palette.ink[400],
  'text-inverse': palette.white,

  // Lines
  border: palette.ink[200],
  'border-strong': palette.ink[300],

  // Brand (SAMONA blue — the primary action colour).
  brand: palette.blue[600],
  'brand-muted': palette.blue[700],
  'brand-contrast': palette.white,
  'brand-soft': palette.blue[50],

  // Onboarding — dark, minimal black/blue/white treatment inspired by
  // Bumble and Rapido onboarding flows.
  'onboarding-bg': palette.ink[950],
  'onboarding-surface': palette.ink[900],
  'onboarding-border': palette.ink[800],

  // Status — used by availability, job states and feedback components.
  success: palette.green[600],
  'success-surface': palette.green[50],
  warning: palette.amber[600],
  'warning-surface': palette.amber[50],
  danger: palette.red[600],
  'danger-surface': palette.red[50],
  info: palette.blue[600],
  'info-surface': palette.blue[50],

  // Availability — the Pro app's most important state.
  online: palette.green[600],
  offline: palette.ink[400],
};

/** 4pt spacing scale. Tailwind's numeric keys are extended, not replaced. */
const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
};

const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 9999,
};

/**
 * Type scale. `display` and `metric` carry the large, glanceable numbers the
 * Pro app leans on (earnings totals, job counts).
 */
const fontSize = {
  caption: ['12px', { lineHeight: '16px' }],
  footnote: ['13px', { lineHeight: '18px' }],
  body: ['15px', { lineHeight: '22px' }],
  'body-lg': ['17px', { lineHeight: '24px' }],
  title: ['20px', { lineHeight: '26px' }],
  'title-lg': ['24px', { lineHeight: '30px' }],
  display: ['32px', { lineHeight: '38px' }],
  metric: ['40px', { lineHeight: '46px' }],
};

/** Elevation. React Native needs the parts split out; see `theme/index.ts`. */
const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
  md: '0 4px 12px rgba(15, 23, 42, 0.08)',
  lg: '0 12px 24px rgba(15, 23, 42, 0.12)',
};

/** Minimum touch target (points). Below this, targets fail accessibility. */
const minTouchTarget = 44;

module.exports = { palette, colors, spacing, radius, fontSize, shadow, minTouchTarget };

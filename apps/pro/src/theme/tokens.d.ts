/** Type surface for `tokens.js`, which is CommonJS so Tailwind can require it. */

export interface ColorScale {
  50: string;
  100: string;
  500: string;
  600: string;
  700: string;
}

/** The brand blue scale is richer (adds 200/300/400/800/900). */
export interface BlueScale extends ColorScale {
  200: string;
  300: string;
  400: string;
  800: string;
  900: string;
}

export interface InkScale extends ColorScale {
  200: string;
  300: string;
  400: string;
  800: string;
  900: string;
  950: string;
}

export interface ColorTokens {
  ink: InkScale;
  green: ColorScale;
  amber: ColorScale;
  red: ColorScale;
  blue: BlueScale;
  white: string;
  black: string;
  transparent: string;

  background: string;
  surface: string;
  'surface-muted': string;
  'surface-inverse': string;

  'text-primary': string;
  'text-secondary': string;
  'text-muted': string;
  'text-inverse': string;

  border: string;
  'border-strong': string;

  brand: string;
  'brand-muted': string;
  'brand-contrast': string;
  'brand-soft': string;

  'onboarding-bg': string;
  'onboarding-surface': string;
  'onboarding-border': string;

  success: string;
  'success-surface': string;
  warning: string;
  'warning-surface': string;
  danger: string;
  'danger-surface': string;
  info: string;
  'info-surface': string;

  online: string;
  offline: string;
}

export type SpacingToken =
  0 | 'px' | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 12 | 14 | 16 | 20 | 24;

export type RadiusToken = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
export type ShadowToken = 'none' | 'sm' | 'md' | 'lg';
export type FontSizeToken =
  'caption' | 'footnote' | 'body' | 'body-lg' | 'title' | 'title-lg' | 'display' | 'metric';

export declare const palette: Record<string, InkScale | ColorScale | string>;
export declare const colors: ColorTokens;
export declare const spacing: Record<SpacingToken, number>;
export declare const radius: Record<RadiusToken, number>;
export declare const fontSize: Record<FontSizeToken, [string, { lineHeight: string }]>;
export declare const shadow: Record<ShadowToken, string>;
export declare const minTouchTarget: number;

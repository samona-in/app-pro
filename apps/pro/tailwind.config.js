/**
 * Tailwind is pinned to v3.x because NativeWind 4 declares `tailwindcss: ~3`.
 * Tailwind 4's CSS-first config is only supported by nativewind@5 (preview).
 *
 * Design tokens live in `src/theme/tokens.js` so the same values feed both
 * Tailwind classes and the StyleSheet-based helpers in `src/theme`.
 */
const { colors, radius, spacing, fontSize, shadow } = require('./src/theme/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      borderRadius: radius,
      spacing,
      fontSize,
      boxShadow: shadow,
    },
  },
  plugins: [],
};

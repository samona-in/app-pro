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

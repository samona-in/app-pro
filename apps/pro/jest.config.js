/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Expo, React Native and NativeWind ship untranspiled ESM and must be
  // transformed rather than ignored.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|native-base|react-native-svg|nativewind|react-native-css-interop|react-native-worklets|react-native-reanimated)',
  ],
  moduleNameMapper: {
    // Bundled artwork lives outside `src`, so it needs its own alias before the
    // catch-all `@/` mapping. Matches the `@/assets/*` path in tsconfig.
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};

/**
 * Guard for running Expo from the monorepo root.
 *
 * Expo resolves its entry point from the `main` field of whichever
 * package.json sits at the project root. Started from here, it would otherwise
 * fall back to the legacy `expo/AppEntry.js`, which imports `../../App` — a
 * file Expo Router projects do not have. The resulting error names a file
 * nobody wrote and says nothing about the real cause.
 *
 * Pointing the root `main` at this file turns that into an actionable message.
 * The SAMONA Pro app lives in apps/pro and must be run from there.
 */
throw new Error(
  [
    '',
    '  Expo was started from the monorepo root, but the app lives in apps/pro.',
    '',
    '  Run it from the repo root with:',
    '      npm run dev:pro',
    '',
    '  Or from the app directory:',
    '      cd apps/pro && npx expo start',
    '',
    '  (Add --clear after changing any EXPO_PUBLIC_* value.)',
    '',
  ].join('\n'),
);

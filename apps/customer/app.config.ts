import appJson from './app.json';

/**
 * Code-level app config. The static `app.json` stays the source of truth for
 * everything except values that must come from the environment — Expo loads
 * `.env` from this directory before evaluating this file.
 */
const config = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    // `google-services.json` is gitignored, so EAS Build receives it as a file
    // environment variable (`GOOGLE_SERVICES_JSON` -> a path on the runner).
    // Locally the variable is unset and we fall back to the checked-out file.
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? appJson.expo.android?.googleServicesFile,
  },
  plugins: [
    ...(appJson.expo.plugins ?? []),
    // Registers MapLibre Native; no API keys or billing involved.
    '@maplibre/maplibre-react-native',
  ],
};

export default config;

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
    // Google Maps on Android only. The key lands in the manifest's
    // `com.google.android.geo.API_KEY` meta-data, which react-native-maps reads.
    // iOS uses Apple Maps and needs no key, so nothing is set there.
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
};

export default config;

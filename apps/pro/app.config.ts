import appJson from './app.json';

/**
 * Code-level app config. The static `app.json` stays the source of truth for
 * everything except values that must come from the environment — Expo loads
 * `.env` from this directory before evaluating this file.
 */
const config = {
  ...appJson.expo,
  plugins: [
    ...(appJson.expo.plugins ?? []),
    // Lets the full-screen job alert wake a locked screen (see modules/job-alert).
    './plugins/withFullScreenJobAlert',
    // Registers MapLibre Native; no API keys or billing involved.
    '@maplibre/maplibre-react-native',
    'expo-audio',
  ],
};

export default config;

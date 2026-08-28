import appJson from './app.json';

/**
 * Code-level app config. The static `app.json` stays the source of truth for
 * everything except values that must come from the environment — Expo loads
 * `.env` from this directory before evaluating this file.
 */
const config = {
  ...appJson.expo,
  plugins: [...(appJson.expo.plugins ?? [])],
};

export default config;

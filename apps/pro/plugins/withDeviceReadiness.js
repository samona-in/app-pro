const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const BATTERY_OPTIMIZATION_PERMISSION = 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS';

/**
 * Job-alert readiness (Android).
 *
 * The local `modules/device-readiness` module probes battery optimization,
 * background data and opens the exact settings screens a pro needs to fix
 * each one. Reading and requesting the battery-optimization exemption needs
 * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS declared at the app level, which this
 * plugin injects during prebuild (the generated `android/` directory is
 * gitignored, so manifests must be produced here).
 */
function withDeviceReadiness(config) {
  return withAndroidManifest(config, (config) => {
    AndroidConfig.Manifest.ensureUsesPermission(
      config.modResults,
      BATTERY_OPTIMIZATION_PERMISSION,
    );
    return config;
  });
}

module.exports = withDeviceReadiness;
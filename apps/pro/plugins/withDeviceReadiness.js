const { withAndroidManifest } = require('expo/config-plugins');

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
 *
 * The config-plugins build in this repo does not expose
 * `Manifest.addUsesPermission`, so the node is appended directly to the
 * parsed manifest tree.
 */
function withDeviceReadiness(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest['uses-permission'] ?? [];
    if (
      !permissions.some(
        (permission) => permission.$ && permission.$['android:name'] === BATTERY_OPTIMIZATION_PERMISSION,
      )
    ) {
      permissions.push({ $: { 'android:name': BATTERY_OPTIMIZATION_PERMISSION } });
      manifest['uses-permission'] = permissions;
    }
    return config;
  });
}

module.exports = withDeviceReadiness;
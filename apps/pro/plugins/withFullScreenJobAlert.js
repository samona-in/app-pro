const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Full-screen job alerts (Android).
 *
 * Almost everything lives in the local `modules/job-alert` Expo module: the
 * USE_FULL_SCREEN_INTENT permission, the over-the-other-apps FCM service, and
 * the Android 14+ runtime permission bridge. That manifest merges through the
 * normal Android library mechanism, so no native file has to be written here.
 *
 * The one thing a library manifest cannot do is reach into the app's launcher
 * activity, so this plugin sets the two attributes that let a full-screen
 * intent wake a locked/dead screen. Without them the alert could open over
 * another app but not over the lock screen, which defeats the point of a
 * 24/7 job alert.
 */
function withShowWhenLocked(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    mainActivity.$['android:showWhenLocked'] = 'true';
    mainActivity.$['android:turnScreenOn'] = 'true';
    return config;
  });
}

module.exports = withShowWhenLocked;
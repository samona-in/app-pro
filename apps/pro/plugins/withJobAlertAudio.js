const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RAW_SOUND_FILE = 'job_alert.wav';

/**
 * Job-alert alarm sound (Android).
 *
 * The native `modules/job-alert` module (and the JS `ensureChannel()`) reference
 * a `job_alert` raw resource for the looping alarm and the notification-channel
 * sound. A config plugin must copy the asset into `res/raw/` on prebuild — the
 * generated `android/` directory is gitignored, so the sound can't live there.
 * Without it, notification sounds silently fall back to the device default and
 * the native loop plays the system alarm tone instead of the branded ring.
 */
function withJobAlertAudio(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const resRaw = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'raw',
      );
      const source = path.join(config.modRequest.projectRoot, 'assets', 'audio', RAW_SOUND_FILE);
      if (!fs.existsSync(source)) {
        throw new Error(`Job-alert sound not found at ${source}`);
      }
      fs.mkdirSync(resRaw, { recursive: true });
      fs.copyFileSync(source, path.join(resRaw, RAW_SOUND_FILE));
      return config;
    },
  ]);
}

module.exports = withJobAlertAudio;
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Job-alert alarm audio.
 *
 * A Rapido-Captain-style request demands a loud, continuous, looping beep that
 * stops the instant the job is resolved. Everything here is module-scoped so a
 * single audio player exists no matter how many screens or hooks subscribe —
 * duplicate `job:new` events and re-renders cannot stack audio instances
 * (CLAUDE.md "Abuse Prevention" spirit of one authoritative resource).
 *
 * The player is created lazily and reused; `remove()` is called to free the
 * native resource once the alert stops.
 */

// A statically-bundled alarm asset. `require()` is Metro's asset import
// mechanism — the standard Expo way to ship a non-JS resource with the bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ALERT_AUDIO = require('../../assets/audio/job_alert.wav');

let player: AudioPlayer | null = null;
let playing = false;

/** True while the alarm is actively sounding. */
export function isJobAlertPlaying(): boolean {
  return playing;
}

/** Configures the audio session so the alarm plays in iOS silent mode. */
async function ensureAudioSessionReady(): Promise<void> {
  await setAudioModeAsync({
    // Keep sounding even when the iPhone is on silent/vibrate — the whole point
    // of a job request alarm. On Android, `playsInSilentMode:false` would
    // suppress playback in ringer-silent, so it must stay true there too.
    playsInSilentMode: true,
    // `doNotMix` grabs exclusive audio focus so competing audio (music, other
    // apps' alerts) cannot drown the request.
    interruptionMode: 'doNotMix',
  });
}

/**
 * Starts the looping alarm. Safe to call repeatedly: if the alarm is already
 * sounding it does nothing, so duplicate events/re-renders can't stack players.
 */
export async function startJobAlert(): Promise<void> {
  if (playing) return;
  // The job-alert alarm is a native concern; the web target has no loud, silent-
  // mode alarm and this keeps web builds from erroring on the native player.
  if (Platform.OS === 'web') return;

  await ensureAudioSessionReady();

  if (!player) {
    player = createAudioPlayer(ALERT_AUDIO);
    player.loop = true;
    player.volume = 1;
    // Android needs the audio session kept active for the loop to hold; the
    // player is already the only source, so share the session.
  }
  player.play();
  playing = true;
}

/**
 * Stops the looping alarm and frees the player. Safe to call when nothing is
 * sounding. Calling several times in a row is harmless.
 */
export function stopJobAlert(): void {
  if (player) {
    try {
      if (player.playing) player.pause();
    } catch {
      // Player may already be torn down by the OS; that is a no-op state.
    }
    try {
      player.remove();
    } catch {
      // remove() on an already-released player is a no-op.
    }
    player = null;
  }
  playing = false;
}

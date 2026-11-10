import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import { resolveUpdatePolicy } from '../policy';
import {
  checkForAppUpdate,
  completeAppUpdate,
  getAppUpdateInstallState,
  isInAppUpdatesSupported,
  startFlexibleUpdate,
  startImmediateUpdate,
  subscribeToInstallState,
  subscribeToUpdateFlowResult,
} from '../services/appUpdateService';
import type { AppUpdateInfo, AppUpdateInstallState, AppUpdateKind } from '../types';

/** The sheet currently on screen. `null` means the app is uninterrupted. */
export type AppUpdateMode = 'optional' | 'mandatory' | 'ready' | 'error';

export interface UseAppUpdatesResult {
  visible: boolean;
  mode: AppUpdateMode | null;
  kind: AppUpdateKind | null;
  info: AppUpdateInfo | null;
  download: AppUpdateInstallState | null;
  isStarting: boolean;
  /** Stable reason key for the current error, when `mode` is `error`. */
  error: string | null;
  /** Starts the flow chosen by Play's release priority. */
  startUpdate: () => void;
  /** Dismisses an optional prompt, a ready prompt or an error. Never blocks. */
  dismiss: () => void;
  /** Installs a downloaded flexible update and lets Play restart the app. */
  restart: () => void;
}

/** Wait for the brand splash to clear before a Play check can raise a sheet. */
const INITIAL_CHECK_DELAY_MS = 2500;
/** Foreground checks are throttled; Play's API is cheap but not free. */
const FOREGROUND_CHECK_INTERVAL_MS = 60_000;

/**
 * Reasons that mean Play cannot complete this update on this device right now.
 * Blocking a mandatory prompt on these would trap the user with a button that
 * can never succeed, so they fall back to the dismissible error sheet.
 */
const UNRECOVERABLE_START_REASONS = new Set([
  'notInstalledFromPlay',
  'playStoreNotFound',
  'playServicesUnavailable',
  'invalidRequest',
  'notAllowed',
  'notAvailable',
  'downloadNotPresent',
  'installUnavailable',
]);

interface PendingPrompt {
  versionCode: number;
  kind: AppUpdateKind;
}

/**
 * Session-wide Google Play update state.
 *
 * - Checks on launch (after the splash) and when the app returns to foreground.
 * - Uses Play's release priority to choose flexible vs immediate. Normal
 *   releases use the flexible flow; priority 4–5 use the blocking immediate flow.
 * - Remembers optional prompts the user dismissed for this session, keyed by
 *   version code, so the same update never nags twice.
 * - Re-surfaces a flexible download that completed while the app was in the
 *   background, offering "Restart Now".
 * - Never blocks the app when an optional check fails. An optional update is
 *   optional; only a critical (`immediate`) release holds the app closed.
 */
export function useAppUpdates(): UseAppUpdatesResult {
  const [mode, setModeState] = useState<AppUpdateMode | null>(null);
  const [kind, setKind] = useState<AppUpdateKind | null>(null);
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [download, setDownload] = useState<AppUpdateInstallState | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modeRef = useRef<AppUpdateMode | null>(null);
  const pendingPromptRef = useRef<PendingPrompt | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const readyDismissedRef = useRef(false);
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);
  const mountedRef = useRef(true);

  const setMode = useCallback((next: AppUpdateMode | null) => {
    modeRef.current = next;
    setModeState(next);
  }, []);

  const promptKey = useCallback((pending: PendingPrompt) => {
    return `${pending.versionCode}:${pending.kind}`;
  }, []);

  /**
   * One guarded check. The guard set (mode, in-flight check, throttle) is read
   * through refs so this callback can stay stable for the AppState listener and
   * the launch timer.
   */
  const checkForUpdates = useCallback(async () => {
    if (!isInAppUpdatesSupported()) return;
    if (checkingRef.current) return;
    if (modeRef.current != null) return;

    const now = Date.now();
    if (now - lastCheckRef.current < FOREGROUND_CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;
    checkingRef.current = true;

    try {
      // A flexible download may have finished while the app was backgrounded.
      const install = await getAppUpdateInstallState();
      if (!mountedRef.current) return;
      setDownload(install);

      if (install.status === 'downloaded') {
        if (readyDismissedRef.current) return;
        setKind('flexible');
        setError(null);
        setMode('ready');
        return;
      }

      // A download is already running; the install listener owns the next UI.
      if (
        install.status === 'pending' ||
        install.status === 'downloading' ||
        install.status === 'installing'
      ) {
        return;
      }

      const nextInfo = await checkForAppUpdate();
      if (!mountedRef.current) return;
      setInfo(nextInfo);

      const policy = resolveUpdatePolicy(nextInfo);
      if (policy == null) return;

      const pending: PendingPrompt = {
        versionCode: nextInfo.availableVersionCode,
        kind: policy,
      };
      if (dismissedRef.current.has(promptKey(pending))) return;

      pendingPromptRef.current = pending;
      setKind(policy);
      setError(null);
      setMode(policy === 'immediate' ? 'mandatory' : 'optional');
    } finally {
      checkingRef.current = false;
    }
  }, [promptKey, setMode]);

  // Launch check, deliberately after the splash has started to clear.
  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => {
      void checkForUpdates();
    }, INITIAL_CHECK_DELAY_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, [checkForUpdates]);

  // Foreground check. A ready-to-install download gets another chance to be
  // acknowledged after the user comes back to the app.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      readyDismissedRef.current = false;
      void checkForUpdates();
    });
    return () => subscription.remove();
  }, [checkForUpdates]);

  // Play streams download progress and the final DOWNLOADED state here.
  useEffect(() => {
    return subscribeToInstallState((state) => {
      if (!mountedRef.current) return;
      setDownload(state);

      if (state.status === 'downloaded') {
        // A blocking prompt always wins; the downloaded update can wait.
        if (modeRef.current === 'mandatory') return;
        readyDismissedRef.current = false;
        pendingPromptRef.current = null;
        setKind('flexible');
        setError(null);
        setMode('ready');
        return;
      }

      if (state.status === 'failed') {
        // A mandatory prompt must stay blocking, but it should explain why.
        if (modeRef.current === 'mandatory') {
          setError('installFailed');
          return;
        }
        if (modeRef.current === 'ready') {
          setError('installFailed');
          return;
        }
        setError('installFailed');
        setMode('error');
        return;
      }

      if (state.status === 'installing') {
        setIsStarting(true);
      }
    });
  }, [setMode]);

  // A cancelled flexible consent is a dismissal: do not ask again this session.
  useEffect(() => {
    return subscribeToUpdateFlowResult((result) => {
      if (result.updateType !== 'flexible' || result.status !== 'cancelled') return;
      const pending = pendingPromptRef.current;
      if (pending != null) dismissedRef.current.add(promptKey(pending));
    });
  }, [promptKey]);

  // Immersive mandatory prompt: Android back must not slip underneath it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (mode !== 'mandatory') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [mode]);

  const startUpdate = useCallback(async () => {
    if (kind == null) return;

    setIsStarting(true);
    setError(null);

    try {
      if (kind === 'immediate') {
        // Play's immediate UI takes over from here; keep the sheet blocking
        // underneath so a cancellation returns to the "Update required" state.
        setMode('mandatory');
        const result = await startImmediateUpdate();
        if (!mountedRef.current) return;

        if (
          result.status === 'started' ||
          result.status === 'cancelled' ||
          result.status === 'busy'
        ) {
          setMode('mandatory');
          return;
        }

        const reason =
          result.status === 'failed'
            ? (result.reason ?? 'failed')
            : result.status === 'notAllowed'
              ? 'notAllowed'
              : 'notAvailable';

        // Play cannot run this update at all on this device. Staying blocking
        // would leave the user with a button that never succeeds.
        if (UNRECOVERABLE_START_REASONS.has(reason)) {
          setError(reason);
          setMode('error');
          return;
        }

        setError(reason);
        setMode('mandatory');
        return;
      }

      const result = await startFlexibleUpdate();
      if (!mountedRef.current) return;

      if (result.started) {
        // The user can keep working; the install listener raises "ready".
        setMode(null);
        return;
      }

      setError(result.reason ?? 'failed');
      setMode('error');
    } catch {
      if (!mountedRef.current) return;
      setError('unavailable');
      setMode(kind === 'immediate' ? 'mandatory' : 'error');
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  }, [kind, setMode]);

  const dismiss = useCallback(() => {
    const current = modeRef.current;
    // Never allow an accidental dismissal while an update is required.
    if (current === 'mandatory') return;

    if (current === 'optional' && pendingPromptRef.current != null) {
      dismissedRef.current.add(promptKey(pendingPromptRef.current));
    }
    if (current === 'ready') readyDismissedRef.current = true;

    setError(null);
    setMode(null);
  }, [promptKey, setMode]);

  const restart = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      const completed = await completeAppUpdate();
      if (!mountedRef.current) return;
      if (!completed) {
        // Keep the ready sheet up; the user can try the install again.
        setError('completeFailed');
      }
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  }, []);

  return {
    visible: mode != null,
    mode,
    kind,
    info,
    download,
    isStarting,
    error,
    startUpdate: () => {
      void startUpdate();
    },
    dismiss,
    restart: () => {
      void restart();
    },
  };
}

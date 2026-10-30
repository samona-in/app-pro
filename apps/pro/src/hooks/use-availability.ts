import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/constants';
import { useAuth } from '@/providers';
import { useProProfile } from './use-onboarding';
import { useSubmitGuard } from './use-submit-guard';
import {
  subscribeToOnlineStatus,
  isOnline as checkIsOnline,
  goOnline,
  goOffline,
  isLocationServicesDisabledError,
  reconcileOnlineStatus,
  DEVICE_NOT_READY_REASON,
  type AvailabilityResult,
} from '@/services/online-status';

interface AvailabilityState {
  state: 'online' | 'offline' | 'loading';
  error: string | null;
  isTransitioning: boolean;
}

/**
 * The single availability switch for the Home header.
 *
 * This is the same backend contract the old availability card used — device
 * readiness, foreground permission, a live position and `POST
 * /pros/availability` — with one rule made explicit: the toggle only shows
 * "on duty" once the server has confirmed it, and a failed toggle falls back to
 * whatever the server still holds (the service now restores that state).
 */
export function useAvailability() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { data: profile } = useProProfile();

  const [status, setStatus] = useState<AvailabilityState>(() =>
    checkIsOnline()
      ? { state: 'online', error: null, isTransitioning: false }
      : { state: 'offline', error: null, isTransitioning: false },
  );

  // The last server-confirmed terminal state. While a toggle is in flight the
  // header keeps showing it (so going offline does not flash "off duty" before
  // the backend agrees), but a fresh go-online never shows online early.
  const [lastTerminalOnline, setLastTerminalOnline] = useState(checkIsOnline);

  useEffect(() => {
    const unsubscribe = subscribeToOnlineStatus((next) => {
      if (next.status !== 'loading') {
        setLastTerminalOnline(next.status === 'online');
      }
      setStatus({
        state: next.status,
        error: next.error,
        isTransitioning: next.isTransitioning,
      });
    });
    return unsubscribe;
  }, []);

  // Align with the server's authoritative value once the profile loads (fixes a
  // stale "offline" right after a cold start), without clobbering a toggle.
  const serverOnline = profile?.isOnline;
  useEffect(() => {
    if (serverOnline !== undefined) {
      reconcileOnlineStatus(serverOnline);
    }
  }, [serverOnline]);

  const isTransitioning = status.state === 'loading' || status.isTransitioning;
  const isOnline = status.state === 'loading' ? lastTerminalOnline : status.state === 'online';

  const { run: toggle, isSubmitting } = useSubmitGuard(async () => {
    if (isTransitioning || isSubmitting) return;

    const next = !isOnline;

    try {
      let result: AvailabilityResult;
      if (next) {
        result = await goOnline(session?.access_token ?? '');
      } else {
        result = await goOffline(session?.access_token ?? '');
      }

      if (!result.success) {
        // A phone that would swallow push-delivered job alerts blocks going
        // online; route the pro to the fix-it screen instead of a bare alert.
        if (result.reason === DEVICE_NOT_READY_REASON) {
          router.push('/device-setup');
          return;
        }
        const message = result.error ?? t('home.errorGeneric');
        if (isLocationServicesDisabledError(result.error)) {
          Alert.alert(t('home.cantGoOnline'), message, [
            { text: t('common.notNow'), style: 'cancel' },
            { text: t('common.openSettings'), onPress: () => void Linking.openSettings() },
          ]);
        } else {
          Alert.alert(next ? t('home.cantGoOnline') : t('home.cantGoOffline'), message);
        }
        return;
      }

      // The server is now the source of truth for other screens (e.g. the Jobs
      // tab gate) that read profile.isOnline.
      void queryClient.invalidateQueries({ queryKey: queryKeys.proProfile });
    } catch (error) {
      Alert.alert(
        next ? t('home.cantGoOnline') : t('home.cantGoOffline'),
        error instanceof Error ? error.message : t('home.errorGeneric'),
      );
    }
  });

  const handleToggle = useCallback(() => {
    void toggle();
  }, [toggle]);

  return {
    isOnline,
    isTransitioning: isTransitioning || isSubmitting,
    /** The backend's real error; hidden while the toggle animates. */
    error: isTransitioning ? null : status.error,
    toggle: handleToggle,
  };
}

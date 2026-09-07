import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Card, IconButton, Screen, Text } from '@/components/ui';
import { isTripStatus } from '@/constants';
import { useProJobs, useProProfile, useDeviceReadiness, useSubmitGuard } from '@/hooks';
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
import { missingReadinessCount } from '@/services/device-readiness-state';
import { queryKeys } from '@/constants';
import { useAuth } from '@/providers';
import { color } from '@/theme';

/**
 * The home screen.
 *
 * The single most important surface for a pro: a prominent Online / Offline
 * (with a Loading in-between) toggle. Job *requests* arrive here as the
 * realtime Rapido-style alert — there is no browse-available-jobs marketplace;
 * a pro acts on a request the moment it lands.
 *
 * When offline, an explicit prompt points the pro back online before they can
 * see or act on any job.
 */

function AvailabilityCard() {
  const { data: profile } = useProProfile();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const sessionRef = session;

  const [status, setStatus] = useState<{
    state: 'online' | 'offline' | 'loading';
    error: string | null;
    isTransitioning: boolean;
  }>(() =>
    checkIsOnline()
      ? { state: 'online', error: null, isTransitioning: false }
      : { state: 'offline', error: null, isTransitioning: false },
  );

  useEffect(() => {
    const unsubscribe = subscribeToOnlineStatus((state) => {
      setStatus({
        state: state.status,
        error: state.error,
        isTransitioning: state.isTransitioning,
      });
    });
    return unsubscribe;
  }, []);

  // Align the in-memory status with the server's authoritative value once the
  // profile loads (fixes a stale "offline" right after a cold start), without
  // overriding an in-flight toggle.
  const serverOnline = profile?.isOnline;
  useEffect(() => {
    if (serverOnline !== undefined) {
      reconcileOnlineStatus(serverOnline);
    }
  }, [serverOnline]);

  const isOnline = status.state === 'online';
  const isLoading = status.state === 'loading' || status.isTransitioning;
  const hasError = status.state === 'offline' && !!status.error;

  const label = isLoading ? 'Loading…' : isOnline ? "You're online" : "You're offline";

  const message = isLoading
    ? 'Toggling your availability…'
    : isOnline
      ? ''
      : (status.error ?? 'Go online to start receiving job requests.');

  const { run } = useSubmitGuard(async () => {
    if (isLoading) return;

    const next = !isOnline;
    setStatus({ state: 'loading', error: null, isTransitioning: true });

    try {
      let result: AvailabilityResult;
      if (next) {
        result = await goOnline(sessionRef?.access_token ?? '');
      } else {
        result = await goOffline(sessionRef?.access_token ?? '');
      }
      if (!result.success) {
        // A device that would swallow push-delivered job alerts blocks going
        // online; route the pro to the fix-it screen instead of a bare alert.
        if (result.reason === DEVICE_NOT_READY_REASON) {
          router.push('/device-setup');
          return;
        }
        const message = result.error ?? 'Something went wrong. Please try again.';
        if (isLocationServicesDisabledError(result.error)) {
          Alert.alert("Can't go online", message, [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]);
        } else {
          Alert.alert(next ? "Can't go online" : "Can't go offline", message);
        }
      } else {
        // The toggle succeeded; the server is now the source of truth for other
        // screens (e.g. the Jobs tab gate) that read profile.isOnline.
        void queryClient.invalidateQueries({ queryKey: queryKeys.proProfile });
      }
    } catch (error) {
      Alert.alert(
        next ? "Can't go online" : "Can't go offline",
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
    }
  });

  return (
    <Card
      variant="raised"
      style={isOnline ? { backgroundColor: color.brand } : { backgroundColor: color.surface }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text
            variant="label"
            style={{
              color: isOnline ? color['brand-contrast'] : color['text-secondary'],
              opacity: isOnline ? 0.7 : undefined,
            }}
          >
            Availability
          </Text>
          <Text
            variant="titleLg"
            className="mt-1"
            style={{ color: isOnline ? color['brand-contrast'] : color['text-primary'] }}
          >
            {label}
          </Text>
          {message ? (
            <Text
              variant="footnote"
              className="mt-1"
              style={{
                color: isLoading
                  ? color.warning
                  : isOnline
                    ? color.success
                    : hasError
                      ? color.danger
                      : color['text-secondary'],
              }}
            >
              {message}
            </Text>
          ) : null}
        </View>

        {isLoading ? (
          <View className="h-14 w-14 items-center justify-center">
            <ActivityIndicator
              color={isOnline ? color['brand-contrast'] : color.brand}
              size="large"
            />
          </View>
        ) : (
          <IconButton
            name={isOnline ? 'power' : 'power-outline'}
            accessibilityLabel={isOnline ? 'Go offline' : 'Go online'}
            onPress={() => void run()}
            haptic={false}
            disabled={isLoading}
            tint={isOnline ? color.brand : color['text-primary']}
            className={isOnline ? 'h-14 w-14 bg-brand-contrast' : 'h-14 w-14 bg-surface-muted'}
            size={26}
          />
        )}
      </View>
    </Card>
  );
}

/**
 * Shown while offline when a phone setting can swallow push-delivered job
 * alerts. The block in goOnline already stops a deaf pro from going online;
 * this banner is the always-visible route to fixing it.
 */
function ReadinessBanner() {
  const { readiness, isReady } = useDeviceReadiness();
  const isOnline = checkIsOnline();
  if (isOnline || readiness === null || isReady) return null;

  const missing = missingReadinessCount(readiness);
  return (
    <Card className="mt-6 border border-warning bg-warning-surface">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text variant="label" className="text-warning">
            Job alerts may not reach you
          </Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            {missing === 1
              ? 'One phone setting can block alerts while the app is closed.'
              : `${missing} phone settings can block alerts while the app is closed.`}{' '}
            Fix them to receive every job request.
          </Text>
        </View>
        <Button
          variant="secondary"
          size="sm"
          label="Fix"
          haptic={false}
          onPress={() => router.push('/device-setup')}
        />
      </View>
    </Card>
  );
}

/** Prompt shown when an offline pro tries to act on a job. */
function OfflineGate() {
  return (
    <Card className="mt-8 items-center px-6 py-8">
      <Text variant="titleLg" className="text-center">
        Go online to see jobs
      </Text>
      <Text variant="body" className="mt-2 text-center text-text-secondary">
        When you're online and your live location is on, job requests arrive here in real time for
        you to accept or decline.
      </Text>
      <Text variant="footnote" className="mt-4 text-center text-text-muted">
        Toggle availability above to go online.
      </Text>
    </Card>
  );
}

export default function Home() {
  const { data: jobs, isPending } = useProJobs();
  const activeTrip = (jobs ?? []).find((job) => isTripStatus(job.status));

  // A pro with an active trip (accepted / on the way) has no use for the
  // availability home. This mirrors the index-route decision, but also runs
  // when the pro returns here by dismissing the trip screen (back swipe / phone
  // back button) instead of only on cold start — so an accepted job always wins
  // over home and pulls the pro straight back into the trip screen.
  useFocusEffect(
    useCallback(() => {
      if (activeTrip && !isPending) {
        router.replace(`/job/${activeTrip.id}/active`);
      }
    }, [activeTrip, isPending]),
  );

  // While the job list is still loading we can't yet rule out an active trip;
  // showing the home UI for a moment would flash the availability screen before
  // the focus effect above redirects. Hold a loading state instead.
  if (isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ActivityIndicator color={color.brand} size="large" />
      </Screen>
    );
  }

  if (activeTrip) {
    return <Redirect href={`/job/${activeTrip.id}/active`} />;
  }

  const isOnline = checkIsOnline();

  return (
    <Screen scrollable>
      <View className="flex-row items-center justify-between pt-2">
        <Wordmark size="sm" />
        <View className="flex-row items-center gap-2">
          <IconButton
            name="briefcase-outline"
            accessibilityLabel="Jobs"
            onPress={() => router.push('/jobs')}
          />
          <IconButton
            name="notifications-outline"
            accessibilityLabel="Notifications"
            onPress={() => router.push('/notifications')}
          />
        </View>
      </View>

      <View className="mt-6">
        <AvailabilityCard />
      </View>

      <ReadinessBanner />

      {isOnline ? (
        <View className="mt-8">
          <Text variant="title">Job requests</Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            A new request will appear here the moment it lands. You have a short window to accept
            it.
          </Text>
        </View>
      ) : (
        <OfflineGate />
      )}
    </Screen>
  );
}

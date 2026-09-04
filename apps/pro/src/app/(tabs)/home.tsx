import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Wordmark } from '@/components/brand/Wordmark';
import { Card, IconButton, Screen, Text } from '@/components/ui';
import { useProProfile, useSubmitGuard } from '@/hooks';
import {
  subscribeToOnlineStatus,
  isOnline as checkIsOnline,
  goOnline,
  goOffline,
  isLocationServicesDisabledError,
  reconcileOnlineStatus,
} from '@/services/online-status';
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
  }>(() => (checkIsOnline() ? { state: 'online', error: null, isTransitioning: false } : { state: 'offline', error: null, isTransitioning: false }));

  useEffect(() => {
    const unsubscribe = subscribeToOnlineStatus((state) => {
      setStatus({ state: state.status, error: state.error, isTransitioning: state.isTransitioning });
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

  const label = isLoading
    ? 'Loading…'
    : isOnline
      ? "You're online"
      : "You're offline";

  const message = isLoading
    ? 'Toggling your availability…'
    : isOnline
      ? ''
      : status.error ?? 'Go online to start receiving job requests.';

  const { run } = useSubmitGuard(async () => {
    if (isLoading) return;

    const next = !isOnline;
    setStatus({ state: 'loading', error: null, isTransitioning: true });

    try {
      let result: { success: boolean; error?: string };
      if (next) {
        result = await goOnline(sessionRef?.access_token ?? '');
      } else {
        result = await goOffline(sessionRef?.access_token ?? '');
      }
      if (!result.success) {
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
      Alert.alert(next ? "Can't go online" : "Can't go offline", error instanceof Error ? error.message : 'Something went wrong. Please try again.');
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
            style={{ color: isOnline ? color['brand-contrast'] : color['text-secondary'], opacity: isOnline ? 0.7 : undefined }}
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
              style={{ color: isLoading ? color.warning : isOnline ? color.success : hasError ? color.danger : color['text-secondary'] }}
            >
              {message}
            </Text>
          ) : null}
        </View>

        {isLoading ? (
          <View className="h-14 w-14 items-center justify-center">
            <ActivityIndicator color={isOnline ? color['brand-contrast'] : color.brand} size="large" />
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

/** Prompt shown when an offline pro tries to act on a job. */
function OfflineGate() {
  return (
    <Card className="mt-8 items-center px-6 py-8">
      <Text variant="titleLg" className="text-center">
        Go online to see jobs
      </Text>
      <Text variant="body" className="mt-2 text-center text-text-secondary">
        When you're online and your live location is on, job requests arrive here in real time for you to accept or decline.
      </Text>
      <Text variant="footnote" className="mt-4 text-center text-text-muted">
        Toggle availability above to go online.
      </Text>
    </Card>
  );
}

export default function Home() {
  const isOnline = checkIsOnline();

  return (
    <Screen scrollable>
      <View className="flex-row items-center justify-between pt-2">
        <Wordmark size="sm" />
        <IconButton
          name="notifications-outline"
          accessibilityLabel="Notifications"
          onPress={() => router.push('/notifications')}
        />
      </View>

      <View className="mt-6">
        <AvailabilityCard />
      </View>

      {isOnline ? (
        <View className="mt-8">
          <Text variant="title">Job requests</Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            A new request will appear here the moment it lands. You have a short window to accept it.
          </Text>
        </View>
      ) : (
        <OfflineGate />
      )}
    </Screen>
  );
}

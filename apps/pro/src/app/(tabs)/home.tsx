import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Wordmark } from '@/components/brand/Wordmark';
import { EmptyState } from '@/components/feedback';
import { AvailableJobCard } from '@/components/jobs';
import { Badge, Card, IconButton, Screen, Text } from '@/components/ui';
import {
  useAvailableJobs,
  useProJobs,
  useProProfile,
  useSubmitGuard,
  useToggleAvailability,
} from '@/hooks';
import { subscribeToOnlineStatus, isOnline as checkIsOnline, goOnline, goOffline } from '@/services/online-status';
import { useAuth } from '@/providers';
import { color } from '@/theme';
import { formatInr } from '@/utils/format';

function AvailabilityCard() {
  const { data: profile } = useProProfile();
  const { session } = useAuth();
  const toggleAvailability = useToggleAvailability();
  const sessionRef = session;

  const [onlineStatus, setOnlineStatus] = useState<'offline' | 'checking-location' | 'requesting-permission' | 'getting-location' | 'connecting' | 'online' | 'offlining' | 'error'>(() => (checkIsOnline() ? 'online' : 'offline'));
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const serverOnline = profile?.isOnline ?? false;
  const isOnline = serverOnline;
  const isBusy = toggleAvailability.isPending || isTransitioning;

  useEffect(() => {
    const unsubscribe = subscribeToOnlineStatus((state) => {
      setOnlineStatus(state.status);
      setStatusError(state.error);
      setIsTransitioning(state.isTransitioning);
    });
    return unsubscribe;
  }, []);

  const getStatusLabel = (status: typeof onlineStatus): string => {
    switch (status) {
      case 'checking-location':
        return 'Checking location...';
      case 'requesting-permission':
        return 'Requesting location permission...';
      case 'getting-location':
        return 'Getting current location...';
      case 'connecting':
        return 'Connecting...';
      case 'online':
        return "You're online";
      case 'offlining':
        return 'Going offline...';
      case 'error':
        return statusError ?? 'Error';
      default:
        return "You're offline";
    }
  };

  const getStatusMessage = (status: typeof onlineStatus): string => {
    switch (status) {
      case 'checking-location':
      case 'requesting-permission':
      case 'getting-location':
      case 'connecting':
        return 'Please wait while we set up your availability.';
      case 'online':
        return 'Receiving job requests near you.';
      case 'offlining':
        return 'Stopping job requests...';
      case 'error':
        return statusError ?? 'Something went wrong. Tap to try again.';
      default:
        return 'Go online to start receiving job requests.';
    }
  };

  const getStatusColor = (status: typeof onlineStatus): string => {
    switch (status) {
      case 'online':
        return color.success;
      case 'error':
        return color.danger;
      case 'checking-location':
      case 'requesting-permission':
      case 'getting-location':
      case 'connecting':
      case 'offlining':
        return color.warning;
      default:
        return color['text-secondary'];
    }
  };

  const { run } = useSubmitGuard(async () => {
    if (isTransitioning) return;

    const next = !isOnline;
    setIsTransitioning(true);
    setStatusError(null);

    try {
      let result: { success: boolean; error?: string };
      if (next) {
        result = await goOnline(sessionRef?.access_token ?? '');
      } else {
        result = await goOffline(sessionRef?.access_token ?? '');
      }
      if (!result.success) {
        Alert.alert(next ? "Can't go online" : "Can't go offline", result.error ?? 'Something went wrong. Please try again.');
      }
    } catch (error) {
      Alert.alert(next ? "Can't go online" : "Can't go offline", error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setIsTransitioning(false);
    }
  });

  return (
    <Card variant="raised" className={isOnline ? 'bg-surface-inverse' : 'bg-surface'}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text variant="label" className={isOnline ? 'text-text-muted' : 'text-text-secondary'}>
            Availability
          </Text>
          <Text
            variant="titleLg"
            className={isOnline ? 'mt-1 text-text-inverse' : 'mt-1 text-text-primary'}
          >
            {getStatusLabel(onlineStatus)}
          </Text>
          <Text variant="footnote" className="mt-1" style={{ color: getStatusColor(onlineStatus) }}>
            {getStatusMessage(onlineStatus)}
          </Text>
          {statusError && onlineStatus !== 'error' && (
            <Text variant="caption" className="mt-1" style={{ color: color.danger }}>
              {statusError}
            </Text>
          )}
        </View>

        {isBusy ? (
          <View className="h-14 w-14 items-center justify-center">
            <ActivityIndicator color={isOnline ? color['text-inverse'] : color.brand} size="large" />
          </View>
        ) : (
          <IconButton
            name={isOnline ? 'power' : 'power-outline'}
            accessibilityLabel={isOnline ? 'Go offline' : 'Go online'}
            onPress={() => void run()}
            haptic={false}
            disabled={isBusy}
            tint={isOnline ? color['text-inverse'] : color['text-primary']}
            className={isOnline ? 'h-14 w-14 bg-online' : 'h-14 w-14 bg-surface-muted'}
            size={26}
          />
        )}
      </View>
    </Card>
  );
}

/** Completed-job count and money earned, read from the real jobs list. */
function TodaySnapshot() {
  const { data: jobs } = useProJobs();
  const finished = (jobs ?? []).filter(
    (job) => job.status === 'PAYMENT_PENDING' || job.status === 'PAID',
  );
  const earned = finished.reduce(
    (sum, job) => sum + (job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise ?? 0),
    0,
  );

  return (
    <View className="mt-4 flex-row gap-3">
      <Card className="flex-1">
        <Text variant="label">Jobs completed</Text>
        <Text variant="display" className="mt-1">
          {finished.length}
        </Text>
      </Card>
      <Card className="flex-1">
        <Text variant="label">Earned</Text>
        <Text variant="display" className="mt-1" numberOfLines={1} adjustsFontSizeToFit>
          {formatInr(earned)}
        </Text>
      </Card>
    </View>
  );
}

/** Open jobs the pro can take, newest first, with a buzz when a new one lands. */
function AvailableFeed() {
  const { data: jobs, isPending } = useAvailableJobs();
  const count = jobs?.length ?? 0;
  const previousCount = useRef(count);

  useEffect(() => {
    if (count > previousCount.current && count > 0) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
    previousCount.current = count;
  }, [count]);

  const isOnline = checkIsOnline();

  return (
    <View className="mt-8">
      <View className="flex-row items-center justify-between">
        <Text variant="title">Job requests</Text>
        <View className="flex-row items-center gap-3">
          <Badge
            label={isOnline ? `Listening · ${count}` : 'Paused'}
            tone={isOnline ? 'success' : 'neutral'}
            withDot
          />
        </View>
      </View>

      {count > 0 ? (
        <View className="mt-3 gap-3">
          {(jobs ?? []).map((job) => (
            <AvailableJobCard key={job.id} job={job} />
          ))}
        </View>
      ) : (
        <Card className="mt-3 min-h-[220px] justify-center">
          <EmptyState
            icon={isOnline ? 'radio-outline' : 'moon-outline'}
            title={
              isPending
                ? 'Listening for requests'
                : isOnline
                  ? 'Waiting for requests'
                  : 'You are offline'
            }
            message={
              isOnline
                ? 'New jobs near you will appear here the moment they come in.'
                : 'Go online to start receiving job requests from customers nearby.'
            }
          />
        </Card>
      )}

      <Text
        variant="footnote"
        className="mt-4 text-center font-semibold text-brand"
        onPress={() => router.push('/available-jobs')}
      >
        Browse all available jobs →
      </Text>
    </View>
  );
}

export default function Home() {
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
        <TodaySnapshot />
      </View>

      <AvailableFeed />
    </Screen>
  );
}
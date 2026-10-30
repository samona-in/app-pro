import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Wordmark } from '@/components/brand/Wordmark';
import { CancellationAlertModal } from '@/components/home/CancellationAlertModal';
import { ProfileCompletionWidget } from '@/components/home/ProfileCompletionWidget';
import { TodayStack } from '@/components/home/TodayStack';
import { ServicesVerificationCard } from '@/components/services/ServicesVerificationCard';
import { Button, Card, IconButton, Screen, Text } from '@/components/ui';
import { isActiveJobStatus, isSettlementPendingStatus } from '@samona/types';
import { useProJobs, useProProfile, useDeviceReadiness, useSubmitGuard } from '@/hooks';
import { useIncomingOffersStore } from '@/stores';
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
 * realtime Rapido-style alert; the briefcase entry opens the browseable job
 * pool — the same open requests, listed for the free, online pro. A pro acts
 * on a request the moment it lands, or browses the pool at their own pace.
 *
 * When offline, an explicit prompt points the pro back online before they can
 * see or act on any job.
 */

function AvailabilityCard() {
  const { t } = useTranslation();
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

  const label = isLoading
    ? t('home.statusLoading')
    : isOnline
      ? t('home.online')
      : t('home.offline');

  const message = isLoading
    ? t('home.toggling')
    : isOnline
      ? ''
      : (status.error ?? t('home.goOnlinePrompt'));

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
        const message = result.error ?? t('home.errorGeneric');
        if (isLocationServicesDisabledError(result.error)) {
          Alert.alert(t('home.cantGoOnline'), message, [
            { text: t('common.notNow'), style: 'cancel' },
            { text: t('common.openSettings'), onPress: () => void Linking.openSettings() },
          ]);
        } else {
          Alert.alert(next ? t('home.cantGoOnline') : t('home.cantGoOffline'), message);
        }
      } else {
        // The toggle succeeded; the server is now the source of truth for other
        // screens (e.g. the Jobs tab gate) that read profile.isOnline.
        void queryClient.invalidateQueries({ queryKey: queryKeys.proProfile });
      }
    } catch (error) {
      Alert.alert(
        next ? t('home.cantGoOnline') : t('home.cantGoOffline'),
        error instanceof Error ? error.message : t('home.errorGeneric'),
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
            {t('home.availabilityLabel')}
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
            accessibilityLabel={isOnline ? t('home.goOffline') : t('home.goOnline')}
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
  const { t } = useTranslation();
  const { readiness, isReady } = useDeviceReadiness();
  const isOnline = checkIsOnline();
  if (isOnline || readiness === null || isReady) return null;

  const missing = missingReadinessCount(readiness);
  return (
    <Card className="mt-6 border border-warning bg-warning-surface">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text variant="label" className="text-warning">
            {t('home.readiness.title')}
          </Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            {t('home.readiness.manySettings', { count: missing })} {t('home.readiness.fixAction')}
          </Text>
        </View>
        <Button
          variant="secondary"
          size="sm"
          label={t('home.fix')}
          haptic={false}
          onPress={() => router.push('/device-setup')}
        />
      </View>
    </Card>
  );
}

/**
 * Shown while offers are pending but the pro closed the incoming-jobs screen:
 * a quiet home entry back into the combined list so no request is ever trapped
 * behind a dismissed screen.
 */
function IncomingRequestsCard() {
  const { t } = useTranslation();
  const count = useIncomingOffersStore((state) => Object.keys(state.offersById).length);
  if (count === 0) return null;
  return (
    <Card className="mt-3 border border-brand-soft bg-brand-soft">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text variant="label" className="text-brand">
            {t('home.incomingRequests.title')}
          </Text>
          <Text variant="bodyStrong" className="mt-0.5">
            {t('home.incomingRequests.waiting', { count })}
          </Text>
        </View>
        <Button
          variant="primary"
          size="sm"
          label={t('home.incomingRequests.review')}
          fullWidth={false}
          haptic={false}
          onPress={() => router.push('/incoming-jobs')}
        />
      </View>
    </Card>
  );
}

/** Prompt shown when an offline pro tries to act on a job. */
export default function Home() {
  const { t } = useTranslation();
  const { data: jobs, isPending } = useProJobs();
  // Money owed wins: a completed but unpaid job (or one awaiting payment) has
  // to be settled before the pro belongs on home — only their own "Collect
  // cash" swipe finishes it. Otherwise an in-flight job routes map-first.
  const jobsList = jobs ?? [];
  const settlementJob = jobsList.find((job) => isSettlementPendingStatus(job.status));
  const activeJob = jobsList.find((job) => isActiveJobStatus(job.status));
  const occupiedJob = settlementJob ?? activeJob;

  // A pro with an unfinished job (accepted through in-progress, or completed
  // but not yet paid) has no use for the availability home. This mirrors the
  // index-route decision, but also runs when the pro returns here by dismissing
  // the job screen (back swipe / phone back button) instead of only on cold
  // start — so an in-flight or unpaid job always wins over home and pulls the
  // pro straight back into the right screen.
  useFocusEffect(
    useCallback(() => {
      if (occupiedJob && !isPending) {
        const suffix = settlementJob ? 'pay' : 'active';
        router.replace(`/job/${occupiedJob.id}/${suffix}`);
      }
    }, [occupiedJob, settlementJob, isPending]),
  );

  // While the job list is still loading we can't yet rule out an open job;
  // showing the home UI for a moment would flash the availability screen before
  // the focus effect above redirects. Hold a loading state instead.
  if (isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ActivityIndicator color={color.brand} size="large" />
      </Screen>
    );
  }

  if (settlementJob) {
    return <Redirect href={`/job/${settlementJob.id}/pay`} />;
  }

  if (activeJob) {
    return <Redirect href={`/job/${activeJob.id}/active`} />;
  }

  return (
    <>
      <Screen scrollable>
        <View className="flex-row items-center justify-between pt-2">
          <Wordmark size="sm" />
          <View className="flex-row items-center gap-2">
            <IconButton
              name="briefcase-outline"
              accessibilityLabel={t('home.jobsAccessibility')}
              onPress={() => router.push('/jobs')}
            />
            <IconButton
              name="notifications-outline"
              accessibilityLabel={t('home.notificationsAccessibility')}
              onPress={() => router.push('/notifications')}
            />
          </View>
        </View>

        <View className="mt-6">
          <AvailabilityCard />
        </View>

        <ProfileCompletionWidget />

        <IncomingRequestsCard />

        <TodayStack />

        <ServicesVerificationCard />

        <ReadinessBanner />
      </Screen>
      {/* The single acknowledgement for a customer-cancelled job; Home is the
          only route a cancelled job leaves the pro on. */}
      <CancellationAlertModal />
    </>
  );
}

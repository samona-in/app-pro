import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AvailableJob, JobDetail } from '@samona/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { AvailabilityToggle } from '@/components/home/AvailabilityToggle';
import { Divider, Screen } from '@/components/ui';
import { JobPoolCard } from '@/components/jobs';
import { offerActions } from '@/services/offer-actions';
import { queryKeys } from '@/constants';
import { useAvailability, useJobPool, useSession } from '@/hooks';
import { occupiedJobRoute } from '@/utils/job-routes';
import { messageForAcceptError } from '@/utils/job-errors';

/** Full-bleed hairline between pool entries, matching the app's list language. */
function PoolSeparator() {
  return <Divider className="-mx-5" />;
}

/**
 * The pro's job pool — every open, eligible request they can take right now,
 * nearest first. The server feeds it through the same matching predicate used
 * for offers, so the pool is exactly the jobs this pro would be offered.
 *
 * Accept is the single action: the claim is atomic server-side, and once it
 * lands the pro is routed to the accepted job (or its cash-settlement screen
 * when money is owed). Realtime `job:new` / `job:status` keep the pool in step
 * with claims, cancellations and expiry.
 *
 * Viewing the pool requires being online. The availability switch lives here
 * too and is backed by the same global online-status store as the Home header,
 * so flipping it in either place updates both.
 */
export default function JobPoolScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep } = useSession();
  // Shared availability state — the same store the Home header subscribes to,
  // so this screen is never out of step with the pro's real duty status.
  const { isOnline, isTransitioning, toggle } = useAvailability();
  const {
    data: jobs = [],
    isPending,
    isError,
    isRefetching,
    refetch,
  } = useJobPool({
    // The pool is only meaningful while on duty; enabling it here also means
    // the list loads by itself the moment the pro switches online.
    enabled: isAuthenticated && isOnboardingComplete && !isLoading && isOnline,
  });
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const handleAccept = useCallback(
    async (job: AvailableJob): Promise<string | null> => {
      setBusyJobId(job.id);
      try {
        const result = await offerActions.accept(job.id);
        if (result.status !== 'done') {
          // A failed claim (taken / expired) already dropped this job from the
          // pool via realtime; the rest stays actionable.
          return result.status === 'error' ? messageForAcceptError(result.error, t) : null;
        }
        // Refresh the assigned-jobs cache so the money-owed rule can route, then
        // land on the just-accepted job (or its payment screen when cash is owed).
        await queryClient.refetchQueries({ queryKey: queryKeys.jobs.all });
        const assigned = queryClient.getQueryData<JobDetail[]>(queryKeys.jobs.all) ?? [];
        const occupied = occupiedJobRoute(assigned);
        router.replace(occupied ?? `/job/${job.id}/active`);
        return null;
      } finally {
        setBusyJobId(null);
      }
    },
    [queryClient, t],
  );

  if (isLoading) {
    return (
      <Screen edges={['bottom']}>
        <LoadingState message={t('jobs.loadingPool')} />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (!isOnboardingComplete) {
    return <Redirect href={`/onboarding/${nextStep ?? 'intro'}`} />;
  }

  return (
    <Screen edges={['bottom']}>
      {/*
        The pro can turn availability on (or off) right here instead of being
        sent back to Home. The switch is the same shared control, so the header
        reflects this change immediately.
      */}
      <View className="flex-row items-center justify-end pt-2">
        <AvailabilityToggle
          isOnline={isOnline}
          isTransitioning={isTransitioning}
          onToggle={toggle}
        />
      </View>

      {!isOnline ? (
        <View className="mt-2 flex-1">
          <EmptyState
            icon="power-outline"
            title={t('jobs.emptyOfflineTitle')}
            message={t('jobs.emptyOfflineMessage')}
          />
        </View>
      ) : isPending ? (
        <View className="mt-2 flex-1">
          <LoadingState message={t('jobs.loadingYourPool')} />
        </View>
      ) : isError ? (
        <ErrorState
          title={t('jobs.errorTitle')}
          message={t('jobs.errorMessage')}
          onRetry={() => void refetch()}
        />
      ) : jobs.length === 0 ? (
        <View className="mt-2 flex-1">
          <EmptyState
            icon="briefcase-outline"
            title={t('jobs.emptyTitle')}
            message={t('jobs.emptyMessage')}
          />
        </View>
      ) : (
        <FlatList
          className="mt-2 flex-1"
          data={jobs}
          keyExtractor={(job) => job.id}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={PoolSeparator}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          renderItem={({ item }) => (
            <JobPoolCard
              job={item}
              busy={busyJobId === item.id}
              onAccept={() => handleAccept(item)}
            />
          )}
        />
      )}
    </Screen>
  );
}

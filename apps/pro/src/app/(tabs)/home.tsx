import { useCallback, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { CancellationAlertModal } from '@/components/home/CancellationAlertModal';
import { EarningsStrip } from '@/components/home/EarningsStrip';
import { HomeBanners, IncomingRequestsBanner, ReadinessBanner } from '@/components/home/HomeBanners';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeMap } from '@/components/home/HomeMap';
import { HomeSheet } from '@/components/home/HomeSheet';
import { OfflineState } from '@/components/home/OfflineState';
import { Screen } from '@/components/ui';
import { isActiveJobStatus, isSettlementPendingStatus } from '@samona/types';
import { useAvailability, useProJobs } from '@/hooks';
import { useIncomingOffersStore } from '@/stores';
import { summarizeTodayEarnings } from '@/utils/earnings';
import { color } from '@/theme';

/**
 * The pro's operations dashboard.
 *
 * Header (availability + notifications), the compact today strip, then either
 * the live map or the off-duty GIF, with a draggable sheet above the tab bar.
 * The job redirect below is intentionally identical to before: an in-flight or
 * unsettled job always wins over Home, however the pro got back here.
 */
export default function Home() {
  const { data: jobs, isPending, isError, refetch } = useProJobs();
  const { isOnline, isTransitioning, toggle } = useAvailability();
  const pendingOffers = useIncomingOffersStore((state) => Object.keys(state.offersById).length);

  const jobsList = useMemo(() => jobs ?? [], [jobs]);
  const summary = useMemo(() => summarizeTodayEarnings(jobsList), [jobsList]);

  // Money owed wins: a completed but unpaid job (or one awaiting payment) has
  // to be settled before the pro belongs on home — only their own "Collect
  // cash" swipe finishes it. Otherwise an in-flight job routes map-first.
  const settlementJob = jobsList.find((job) => isSettlementPendingStatus(job.status));
  const activeJob = jobsList.find((job) => isActiveJobStatus(job.status));
  const occupiedJob = settlementJob ?? activeJob;

  // A pro with an unfinished job has no use for the availability home. This
  // mirrors the index-route decision but also runs when the pro returns here
  // by dismissing the job screen (back swipe / phone back button).
  useFocusEffect(
    useCallback(() => {
      if (occupiedJob && !isPending) {
        const suffix = settlementJob ? 'pay' : 'active';
        router.replace(`/job/${occupiedJob.id}/${suffix}`);
      }
    }, [occupiedJob, settlementJob, isPending]),
  );

  const handleRetryEarnings = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleOpenEarnings = useCallback(() => {
    router.push('/earnings');
  }, []);

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
      <Screen edges={['top']} padded={false}>
        <HomeHeader isOnline={isOnline} isTransitioning={isTransitioning} onToggle={toggle} />

        <EarningsStrip
          summary={summary}
          isLoading={isPending}
          isError={isError}
          onRetry={handleRetryEarnings}
          onOpenEarnings={handleOpenEarnings}
        />

        <View className="flex-1 overflow-hidden">
          {isOnline ? <HomeMap /> : <OfflineState />}

          <HomeBanners>
            <ReadinessBanner isOnline={isOnline} />
            {isOnline ? <IncomingRequestsBanner count={pendingOffers} /> : null}
          </HomeBanners>

          <HomeSheet />
        </View>
      </Screen>
      {/* The single acknowledgement for a customer-cancelled job; Home is the
          only route a cancelled job leaves the pro on. */}
      <CancellationAlertModal />
    </>
  );
}

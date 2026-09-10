import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isActiveJobStatus, isSettlementPendingStatus } from '@samona/types';
import { EmptyState, LoadingState } from '@/components/feedback';
import { CallMessageButton, CollectCashSheet } from '@/components/jobs';
import { Divider, Screen, SwipeToConfirm, Text } from '@/components/ui';
import { useCollectCash, useProJobs, useUnreadMessages } from '@/hooks';
import { color } from '@/theme';
import { formatInr } from '@/utils/format';

/**
 * Cash settlement — the pro's resting screen once the work is done and until
 * the money is confirmed collected (COMPLETED / PAYMENT_PENDING → PAID). The
 * pro stays here across both pending states; only their own swipe — "Collect
 * cash" — releases it, through a locked-in payment sheet, to the availability
 * home. The server walks the same status steps the customer's online settle
 * would have taken and is idempotent once paid.
 */
export default function CollectCashScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: jobs, isPending, isFetching, refetch } = useProJobs();
  const unread = useUnreadMessages();
  const collect = useCollectCash();

  // Docks the payment sheet. It is presented by the swipe, and the pro may not
  // leave the payment screen until it settles — the sheet re-presents itself
  // if dismissed mid-processing, and navigates home on its own after success.
  const [collectOpen, setCollectOpen] = useState(false);

  const job = useMemo(() => (jobs ?? []).find((item) => item.id === id), [id, jobs]);

  // The list cache may momentarily lag a just-completed job; refetch once
  // before ever flashing "Job not found".
  const refetchedForJob = useRef(false);
  useEffect(() => {
    if (job || refetchedForJob.current) return;
    refetchedForJob.current = true;
    void refetch();
  }, [job, refetch]);

  if (isPending || (!job && isFetching)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Loading payment" />
      </Screen>
    );
  }

  if (!job) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="card-outline"
          title="Payment not found"
          message="This job is no longer assigned to you, or it has finished."
        />
      </Screen>
    );
  }

  // Only a job pending settlement belongs here. Anything already paid,
  // cancelled or expired returns to the availability home — unless the payment
  // sheet is up, in which case the sheet owns the exit (success beat → home).
  if (!collectOpen && !isSettlementPendingStatus(job.status)) {
    return <Redirect href="/home" />;
  }

  const amountPaise = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const customerName = job.customer?.displayName ?? 'Customer';

  function onSwipeCollectCash() {
    setCollectOpen(true);
    void collect.mutateAsync(id).catch(() => {
      // Failure stays in the sheet (it owns the error + retry UI); closing it
      // hands back to the swipe.
    });
  }

  // Only after the money is confirmed collected does the pro move on — straight
  // to an already-accepted job waiting in the queue, or home when there is none.
  // Home itself re-routes to that job once refetched, so a momentarily stale
  // list can never strand the pro on the home screen.
  function onPaymentDone() {
    const next = (jobs ?? []).find((job) => isActiveJobStatus(job.status));
    router.replace(next ? `/job/${next.id}/active` : '/home');
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Payment',
          headerBackVisible: false,
          headerBackTitle: 'Back',
          headerTintColor: color['text-primary'],
          headerTitleStyle: { fontSize: 16, color: color['text-primary'] },
          headerStyle: { backgroundColor: color.surface },
          headerRight: () => <CallMessageButton jobId={id} unread={unread.countFor(id)} />,
        }}
      />

      <Screen edges={['bottom']} className="bg-surface">
        <View className="flex-1">
          {/* Amount to collect — the screen's reason to exist, sized to be
              read at a glance while standing on a doorstep. */}
          <View className="flex-1 items-center justify-center px-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
              <Ionicons name="cash-outline" size={30} color={color.brand} />
            </View>
            <Text variant="bodyLg" className="mt-5 text-text-secondary">
              Amount to be collected
            </Text>
            <Text variant="display" className="mt-1 text-text-primary">
              {formatInr(amountPaise)}
            </Text>
            <Text variant="footnote" className="mt-2 text-center">
              Collect this amount from {customerName} in cash, then swipe to close the job.
            </Text>
          </View>

          {/* Who and what — quick confirmation against the open job. */}
          <View className="border-t border-border pt-4">
            <View className="flex-row items-center gap-3 px-5">
              <Ionicons name="person-circle-outline" size={22} color={color['text-secondary']} />
              <View className="flex-1">
                <Text variant="bodyStrong">{customerName}</Text>
                <Text variant="footnote" className="mt-0.5 text-text-secondary">
                  {job.customSkill ?? job.skill.name} · {job.service.name}
                </Text>
              </View>
            </View>

            <Divider spaced />

            {/* The one action that closes a cash settlement. Disabled while the
                sheet is up — the sheet owns the exit from that point. */}
            <SwipeToConfirm
              label="Collect cash"
              disabled={collectOpen}
              loading={collect.isPending}
              onConfirm={onSwipeCollectCash}
            />
          </View>
        </View>
      </Screen>

      <CollectCashSheet
        visible={collectOpen}
        amountPaise={amountPaise}
        isPending={collect.isPending}
        settled={collect.isSuccess}
        errorMessage={collect.isError ? collect.error?.message : undefined}
        onRetry={() => void collect.mutateAsync(id).catch(() => {})}
        onDone={onPaymentDone}
        onClose={() => setCollectOpen(false)}
      />
    </>
  );
}

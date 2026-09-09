import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { JobStatus } from '@samona/types';
import { isSettlementPendingStatus } from '@samona/types';
import { EmptyState } from '@/components/feedback';
import { Card, Divider, Screen, Text } from '@/components/ui';
import { JobStatusBadge } from '@/components/jobs';
import { useJobHistory } from '@/hooks';
import { isOnline as checkIsOnline } from '@/services/online-status';
import { color } from '@/theme';
import { formatInr } from '@/utils/format';

/**
 * Past jobs — every request the pro was offered, including ones nobody
 * accepted. No Active/Completed/All filters: this is simply the history of
 * requests and where they ended up.
 *
 * Viewing past jobs requires being online; when offline the pro is pointed
 * back to the home toggle.
 */

function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'ACCEPTED':
    case 'TRAVELLING':
    case 'ARRIVED':
    case 'IN_PROGRESS':
      return 'Active';
    case 'COMPLETED':
      return 'Collect payment';
    case 'PAYMENT_PENDING':
    case 'PAID':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Expired';
    default:
      return 'Requested';
  }
}

/** What a history row does when tapped, based on where that job is today. */
function openJob(job: { id: string; status: JobStatus }) {
  if (isSettlementPendingStatus(job.status)) {
    // The pro's doorstep settlement screen.
    router.push({ pathname: '/job/[id]/pay', params: { id: job.id } });
    return;
  }
  if (['ACCEPTED', 'TRAVELLING', 'ARRIVED', 'IN_PROGRESS'].includes(job.status)) {
    router.push({ pathname: '/job/[id]/active', params: { id: job.id } });
  }
}

export default function Jobs() {
  const { data: jobs, isPending } = useJobHistory();
  const isOnline = checkIsOnline();

  return (
    <Screen>
      <View className="pt-2">
        <Text variant="titleLg">Past jobs</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          Every job request you were offered, including ones nobody accepted.
        </Text>
      </View>

      {!isOnline ? (
        <View className="mt-2 flex-1">
          <EmptyState
            icon="power-outline"
            title="Go online to see jobs"
            message="Your job history is available when you're online. Toggle availability on the home screen."
          />
        </View>
      ) : isPending ? (
        <View className="mt-2 flex-1">
          <EmptyState icon="briefcase-outline" title="Loading your jobs" message="Fetching your job history…" />
        </View>
      ) : (jobs?.length ?? 0) > 0 ? (
        <Card padded={false} className="mt-4 overflow-hidden">
          {(jobs ?? []).map((job, index) => (
            <View key={job.id}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => openJob(job)}
                className="active:bg-surface-muted"
              >
                <View className="flex-row items-center gap-3 px-4 py-4">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text variant="bodyStrong" className="flex-shrink">
                        {job.service.name}
                      </Text>
                      <JobStatusBadge status={job.status} />
                    </View>
                    {job.customSkill ? (
                      <Text variant="footnote" className="mt-0.5 text-text-secondary">
                        {job.customSkill}
                      </Text>
                    ) : null}
                    <Text variant="footnote" className="mt-0.5 text-text-muted" numberOfLines={1}>
                      {statusLabel(job.status)}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text variant="bodyStrong">
                      {formatInr(job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
                  </View>
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <View className="mt-2 flex-1">
          <EmptyState
            icon="time-outline"
            title="No past jobs yet"
            message="When you're offered a job request, it will show up here with its outcome."
          />
        </View>
      )}
    </Screen>
  );
}

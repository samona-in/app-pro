import { View } from 'react-native';
import { LoadingState, EmptyState } from '@/components/feedback';
import { AvailableJobCard } from '@/components/jobs';
import { Screen, Text } from '@/components/ui';
import { useAvailableJobs } from '@/hooks';

/**
 * Open requests nearby. These requests waited past their dispatch rounds, so
 * any eligible pro can put themselves forward; the customer picks from the
 * interested list.
 */
export default function AvailableJobs() {
  const { data: jobs, isPending } = useAvailableJobs();

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">Available jobs</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          Open requests customers are waiting on. Express interest to be shortlisted.
        </Text>
      </View>

      {isPending ? (
        <View className="mt-10">
          <LoadingState message="Finding jobs near you" />
        </View>
      ) : (jobs?.length ?? 0) > 0 ? (
        <View className="mt-4 gap-3">
          {(jobs ?? []).map((job) => (
            <AvailableJobCard key={job.id} job={job} />
          ))}
        </View>
      ) : (
        <View className="mt-10 flex-1">
          <EmptyState
            icon="globe-outline"
            title="No open jobs right now"
            message="Requests that no pro could take immediately appear here. Check back soon, or go online to receive direct offers."
          />
        </View>
      )}
    </Screen>
  );
}
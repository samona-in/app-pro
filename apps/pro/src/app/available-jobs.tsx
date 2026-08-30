import { View } from 'react-native';
import { LoadingState, EmptyState } from '@/components/feedback';
import { AvailableJobCard } from '@/components/jobs';
import { Screen, Text } from '@/components/ui';
import { useAvailableJobs } from '@/hooks';

/**
 * Open jobs nearby. Every eligible pro can accept them; the first to accept
 * claims the job atomically.
 */
export default function AvailableJobs() {
  const { data: jobs, isPending } = useAvailableJobs();

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">Available jobs</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          Open jobs near you. Accept one before another professional does.
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
            message="Jobs no one has taken yet appear here. Check back soon, or go online to be among the first to know."
          />
        </View>
      )}
    </Screen>
  );
}
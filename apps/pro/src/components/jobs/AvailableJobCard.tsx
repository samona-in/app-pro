import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AvailableJob } from '@samona/types';
import { Button, Card, Text } from '@/components/ui';
import { useAcceptJob, useSubmitGuard } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatDistance, formatEta, formatInr, formatRelativeTime } from '@/utils/format';

/**
 * One open job in the Available Jobs marketplace. Accepting claims it
 * atomically server-side; a fire-and-forget refetch reconciles the pool.
 */
export function AvailableJobCard({ job, className }: { job: AvailableJob; className?: string }) {
  const accept = useAcceptJob();
  const { run, isSubmitting } = useSubmitGuard(async () => {
    try {
      await accept.mutateAsync(job.id);
    } catch (error) {
      Alert.alert(
        'This job was just taken',
        error instanceof Error ? error.message : 'Another professional may have accepted it first.',
      );
    }
  });

  return (
    <Card className={cn('gap-3', className)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="bodyStrong">{job.service.name}</Text>
          {job.customSkill ? (
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
              {job.customSkill}
            </Text>
          ) : null}
          <Text variant="footnote" className="mt-0.5 text-text-secondary" numberOfLines={2}>
            {job.description ?? 'No description provided.'}
          </Text>
        </View>
        <Text variant="title">{formatInr(job.basePayPaise)}</Text>
      </View>

      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1">
          <Ionicons name="navigate-outline" size={14} color={color['text-muted']} />
          <Text variant="caption" className="text-text-secondary">
            {formatDistance(job.distanceKm)} · {formatEta(job.estimatedEtaMinutes)}
          </Text>
        </View>
        <Text variant="caption" className="text-text-muted">
          {formatRelativeTime(job.createdAt)}
        </Text>
      </View>

      <Button
        label="Accept this job"
        variant="primary"
        size="sm"
        loading={isSubmitting}
        onPress={() => void run()}
      />
    </Card>
  );
}
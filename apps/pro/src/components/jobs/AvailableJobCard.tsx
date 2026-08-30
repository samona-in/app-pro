import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AvailableJobDto } from '@samona/types';
import { Button, Card, Text } from '@/components/ui';
import { useExpressInterest, useSubmitGuard } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatDistance, formatEta, formatInr, formatRelativeTime } from '@/utils/format';

/**
 * One open request in the Available Jobs marketplace. Expressing interest puts
 * the pro on the customer's shortlist; the customer picks from there.
 */
export function AvailableJobCard({ job, className }: { job: AvailableJobDto; className?: string }) {
  const interest = useExpressInterest();
  const { run, isSubmitting } = useSubmitGuard(async () => {
    await interest.mutateAsync(job.id);
  });

  return (
    <Card className={cn('gap-3', className)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="bodyStrong">{job.service.name}</Text>
          <Text variant="footnote" className="mt-0.5 text-text-secondary" numberOfLines={2}>
            {job.description ?? 'No description provided.'}
          </Text>
        </View>
        <Text variant="title">{formatInr(job.estimatedPrice)}</Text>
      </View>

      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1">
          <Ionicons name="navigate-outline" size={14} color={color['text-muted']} />
          <Text variant="caption" className="text-text-secondary">
            {formatDistance(job.distanceKm)} · {formatEta(job.estimatedEtaMinutes)}
          </Text>
        </View>
        <Text variant="caption" className="text-text-muted">
          {formatRelativeTime(job.requestedAt)}
        </Text>
      </View>

      {job.address ? (
        <Text variant="footnote" className="text-text-muted" numberOfLines={1}>
          {job.address}
        </Text>
      ) : null}

      <Button
        label={job.isInterested ? 'Interested' : "I'm interested"}
        variant={job.isInterested ? 'secondary' : 'primary'}
        size="sm"
        disabled={job.isInterested}
        loading={isSubmitting}
        onPress={() => void run()}
      />
    </Card>
  );
}
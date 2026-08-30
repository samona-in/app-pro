import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/**
 * One professional on the customer's shortlist, ready to be chosen.
 * Presentation only — the "select" call lives on the screen so the whole
 * list can share one in-flight mutation.
 */
export function RespondingProRow({
  displayName,
  rating,
  completedJobs,
  distanceKm,
  estimatedEtaMinutes,
  responderType,
  isSelected,
  className,
}: {
  displayName: string | null;
  rating: number | null;
  completedJobs: number;
  distanceKm: number | null;
  estimatedEtaMinutes: number | null;
  /** How this pro entered the shortlist; shown as a small caption. */
  responderType: 'offer' | 'interest';
  isSelected: boolean;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-center gap-3', className)}>
      <Avatar name={displayName ?? '?'} size="md" />

      <View className="flex-1">
        <Text variant="bodyStrong">{displayName ?? 'Unnamed professional'}</Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          {rating !== null ? (
            <View className="flex-row items-center gap-0.5">
              <Ionicons name="star" size={12} color={color.warning} />
              <Text variant="caption">{rating.toFixed(1)}</Text>
            </View>
          ) : null}
          <Text variant="caption" className="text-text-muted">
            {completedJobs} job{completedJobs === 1 ? '' : 's'}
          </Text>
          {distanceKm !== null ? (
            <Text variant="caption" className="text-text-muted">
              · {distanceKm.toFixed(1)} km
            </Text>
          ) : null}
          {estimatedEtaMinutes !== null ? (
            <Text variant="caption" className="text-text-muted">
              · {estimatedEtaMinutes} min
            </Text>
          ) : null}
        </View>
      </View>

      <Text variant="caption" className="uppercase text-text-muted">
        {responderType === 'offer' ? 'Offered' : 'Interested'}
      </Text>

      <View
        className={cn('h-3 w-3 rounded-full', isSelected ? 'bg-success' : 'bg-border-strong')}
      />
    </View>
  );
}
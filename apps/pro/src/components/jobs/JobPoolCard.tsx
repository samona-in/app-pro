import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AvailableJob } from '@samona/types';
import { Badge, Button, Text } from '@/components/ui';
import { formatDistance, formatEta, formatInr } from '@/utils/format';

/**
 * One entry in the pro's job pool, matching the offer surface's rhythm: the
 * service, a category, the guaranteed amount, how far away it is and a summary
 * of the work. Accept is the single action — the claim is atomic server-side,
 * so a failed accept (already taken / expired / offline) surfaces an inline
 * message while the rest of the pool stays actionable.
 *
 * Rendered as a full-bleed block rather than a boxed card, so the pool reads as
 * one continuous list — the same language as the rest of the app. Entries are
 * separated by a hairline in the screen.
 */
export function JobPoolCard({
  job,
  busy,
  onAccept,
}: {
  job: AvailableJob;
  busy: boolean;
  onAccept: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const category = job.customSkill ?? job.skill.name;

  return (
    <View className="py-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-4">
          <Text variant="label" className="text-text-secondary">
            {job.service.name}
          </Text>
          <Text variant="title" className="mt-0.5">
            {category}
          </Text>
        </View>
        <Text variant="metric" className="text-success">
          {formatInr(job.basePayPaise)}
        </Text>
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <Badge label={formatDistance(job.distanceKm, t)} tone="info" />
        {job.estimatedEtaMinutes !== null ? (
          <Badge label={formatEta(job.estimatedEtaMinutes, t)} tone="neutral" />
        ) : null}
      </View>

      {job.locationLabel ? (
        <Text variant="body" className="mt-3 text-text-secondary">
          {job.locationLabel}
        </Text>
      ) : null}

      {job.description ? (
        <Text variant="body" className="mt-1 text-text-muted" numberOfLines={2}>
          {job.description}
        </Text>
      ) : null}

      {error ? (
        <Text variant="caption" className="mt-3 text-danger">
          {error}
        </Text>
      ) : null}

      <Button
        variant="success"
        label={t('jobs.accept')}
        size="md"
        className="mt-4"
        fullWidth
        disabled={busy}
        loading={busy}
        onPress={() => {
          void onAccept().then((message) => setError(message));
        }}
      />
    </View>
  );
}

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { JobOfferDto } from '@samona/types';
import { Button, Card, Text } from '@/components/ui';
import { useRespondToOffer, useSubmitGuard } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatDistance, formatEta, formatInr } from '@/utils/format';
import { OfferCountdown } from './OfferCountdown';

/**
 * One incoming dispatch offer. Accepting moves the request to the customer's
 * shortlist; declining lets the next dispatch round reach other pros.
 * Decided in seconds, so both actions sit on the card.
 */
export function OfferCard({ offer, className }: { offer: JobOfferDto; className?: string }) {
  const respond = useRespondToOffer();
  const { run, isSubmitting } = useSubmitGuard(async (action: 'accept' | 'decline') => {
    await respond.mutateAsync({ offerId: offer.id, action });
  });

  const answered = offer.status !== 'OFFERED';

  return (
    <Card variant="raised" className={cn('gap-3', className)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="bodyStrong">{offer.service.name}</Text>
          <Text variant="footnote" className="mt-0.5 text-text-secondary" numberOfLines={2}>
            {offer.request.description ?? 'No description provided.'}
          </Text>
        </View>
        <Text variant="title" className="text-text-primary">
          {formatInr(offer.request.estimatedPrice)}
        </Text>
      </View>

      <Text variant="footnote" className="text-text-muted" numberOfLines={1}>
        {offer.request.address ?? 'No address shared'}
      </Text>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-4">
          <View className="flex-row items-center gap-1">
            <Ionicons name="navigate-outline" size={14} color={color['text-muted']} />
            <Text variant="caption" className="text-text-secondary">
              {formatDistance(offer.distanceKm)} · {formatEta(offer.estimatedEtaMinutes)}
            </Text>
          </View>
        </View>
        {answered ? (
          <Text variant="footnote" className="font-semibold text-text-muted">
            {offer.status === 'ACCEPTED'
              ? 'Accepted — waiting for customer'
              : offer.status === 'SELECTED'
                ? 'You were selected'
                : offer.status === 'DECLINED'
                  ? 'Declined'
                  : 'Offer closed'}
          </Text>
        ) : (
          <OfferCountdown expiresAt={offer.expiresAt} />
        )}
      </View>

      {!answered ? (
        <View className="flex-row gap-2">
          <Button label="Decline" variant="secondary" size="sm" className="flex-1"
            loading={isSubmitting} onPress={() => void run('decline')} />
          <Button label="Accept" variant="success" size="sm" className="flex-1"
            loading={isSubmitting} onPress={() => void run('accept')} />
        </View>
      ) : null}
    </Card>
  );
}
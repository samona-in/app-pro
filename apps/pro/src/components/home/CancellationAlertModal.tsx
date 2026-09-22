import { Modal, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text } from '@/components/ui';
import { useJobCancellationStore, selectLatestUnacknowledged } from '@/stores/job-cancellation';
import { color } from '@/theme';

/**
 * The single acknowledgement surface for a customer-cancelled job.
 *
 * Rendered on Home (the only route a cancelled job leaves the pro on). It
 * presents the most recent unacknowledged cancellation as a centered,
 * non-dismissible card: the backdrop swallow is inert, `onRequestClose` is a
 * no-op, and there is exactly one primary action — `Okay`. There is nothing on
 * the pro's side left to act on, so tapping the button only clears the alert
 * (stops any remaining ring) and leaves the pro on Home. The card stays up no
 * matter how many jobs were cancelled; `Okay` acknowledges them all at once.
 */
export function CancellationAlertModal() {
  const { t } = useTranslation();
  const cancellation = useJobCancellationStore(selectLatestUnacknowledged);
  const count = useJobCancellationStore((state) => Object.keys(state.cancellations).length);
  if (!cancellation) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      statusBarTranslucent
      onRequestClose={() => {
        // Non-dismissible by design: an unacknowledged cancellation is not
        // something the hardware back button gets to wave away.
      }}
    >
      {/* The backdrop swallows touches but reacts to none. */}
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(9, 11, 29, 0.6)' }}>
        <Card variant="raised" padded className="w-full">
          <View className="items-center">
            <View
              className="h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: color['danger-surface'] }}
            >
              <Ionicons name="close-circle-outline" size={30} color={color.danger} />
            </View>
            <Text variant="titleLg" className="mt-4 text-center">
              {t('cancellation.title')}
            </Text>
            <Text variant="body" className="mt-2 text-center text-text-secondary">
              {cancellation.serviceName
                ? t('cancellation.yourJobCancelled', { serviceName: cancellation.serviceName })
                : t('cancellation.genericBody')}
            </Text>
            {count > 1 ? (
              <Text variant="footnote" className="mt-2 text-center text-text-muted">
                {t('cancellation.awaitingAck', { count })}
              </Text>
            ) : null}
          </View>

          {/* The single, explicit acknowledgement. */}
          <Button
            label={t('cancellation.okay')}
            size="lg"
            variant="primary"
            className="mt-6 w-full"
            onPress={() => void useJobCancellationStore.getState().acknowledge(cancellation.jobId)}
          />
        </Card>
      </View>
    </Modal>
  );
}
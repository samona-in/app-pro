import type { ReactNode } from 'react';
import { Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { JobStatus, isChatClosed, type JobStatus as Status } from '@samona/types';
import { UnreadBadge } from '@/components/chat';
import { Card, Screen, Text } from '@/components/ui';
import { useCancelJob, useProJobs, useSubmitGuard, useUnreadMessages } from '@/hooks';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * The statuses a pro may still back out of. Cancel is only an option up to
 * ARRIVED — the moment the pro has seen the work on site. Once the job starts
 * (IN_PROGRESS) and through completion, collection and payout it is locked.
 * The server enforces the same rule; this is just what the screen surfaces.
 */
const CANCELLABLE: readonly Status[] = [
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
];

function ActionRow({
  icon,
  label,
  onPress,
  destructive = false,
  badge,
}: {
  icon: IoniconName;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  /** Optional trailing slot for an unread counter, rendered before the chevron. */
  badge?: ReactNode;
}) {
  const tint = destructive ? color.danger : color['text-secondary'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
      onPress={() => {
        if (onPress) onPress();
      }}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text variant="body" className={`ml-3 flex-1 ${destructive ? 'text-danger' : ''}`}>
        {label}
      </Text>
      {badge}
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

export default function JobActionsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const unread = useUnreadMessages();
  const { data: jobs } = useProJobs();
  const cancel = useCancelJob();

  // Reads the live status from the same list the job screens use, so the row
  // disappears the moment the job starts (or completes). Unknown job — e.g.
  // the payment screen reached directly — means no cancel, which is the safe
  // default: never surface a cancel the server would reject.
  const job = (jobs ?? []).find((item) => item.id === id);
  const cancellable = job !== undefined && CANCELLABLE.includes(job.status);
  // A paid, cancelled or expired job's conversation is frozen: the server does
  // not accept new messages, so the entry is hidden rather than dead-ended.
  const chatOpen = job === undefined || !isChatClosed(job.status);

  const { run: requestCancel } = useSubmitGuard(() => {
    Alert.alert(
      t('contact.confirmCancelTitle'),
      job?.locationLabel ? t('contact.confirmCancelBeforeStart') : t('contact.confirmCancelGeneric'),
      [
        { text: t('contact.keepJob'), style: 'cancel' },
        {
          text: t('contact.cancelJob'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await cancel.mutateAsync({ jobId: id });
                // Drop the modal and land on Home: the server has freed the
                // pro, and the job screens will no longer show this job.
                router.replace('/home');
              } catch (error) {
                Alert.alert(
                  t('contact.couldNotCancel'),
                  error instanceof Error ? error.message : t('common.retry'),
                );
              }
            })();
          },
        },
      ],
    );
  });

  return (
    <Screen scrollable>
      {chatOpen ? (
        <>
          <Text variant="label" className="mt-2">
            {t('contact.title')}
          </Text>
          <Card className="mt-2" padded={false}>
            <ActionRow
              icon="chatbubble-ellipses-outline"
              label={t('contact.contactCustomer')}
              badge={<UnreadBadge count={unread.countFor(id)} className="mr-2" />}
              onPress={() => router.replace({ pathname: '/job/[id]/chat', params: { id } })}
            />
          </Card>
        </>
      ) : null}

      {cancellable ? (
        <>
          <Text variant="label" className="mt-6">
            {t('contact.cancelSection')}
          </Text>
          <Card className="mt-2" padded={false}>
            <ActionRow
              icon="close-circle-outline"
              label={t('contact.cancelMyJob')}
              destructive
              onPress={() => void requestCancel()}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
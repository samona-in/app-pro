import { EmptyState } from '@/components/feedback';
import { Screen } from '@/components/ui';

export default function Notifications() {
  return (
    <Screen edges={[]}>
      <EmptyState
        icon="notifications-outline"
        title="No notifications yet"
        message="Job requests, status updates and payout alerts will appear here."
      />
    </Screen>
  );
}

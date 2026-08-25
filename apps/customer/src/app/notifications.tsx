import { EmptyState } from '@/components/feedback';
import { Screen } from '@/components/ui';

export default function Notifications() {
  return (
    <Screen edges={[]}>
      <EmptyState
        icon="notifications-outline"
        title="No notifications yet"
        message="Booking confirmations, status updates and reminders will appear here."
      />
    </Screen>
  );
}

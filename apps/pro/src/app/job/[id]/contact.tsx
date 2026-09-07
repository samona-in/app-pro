import { Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, Text } from '@/components/ui';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Job actions — opened from the trip screen's call+message contact button.
 *
 * Two routes to manage the active job:
 *   - Contact customer: reach the customer by phone or message.
 *   - Cancel my job: back out of an accepted / in-flight job.
 *
 * Both call/messaging and cancellation are not yet wired to a live flow, so each
 * option surfaces a placeholder for now. The cancel row is tinted destructive so
 * the intent is clear before the real cancel path lands.
 */

function ActionRow({
  icon,
  label,
  destructive = false,
}: {
  icon: IoniconName;
  label: string;
  destructive?: boolean;
}) {
  const tint = destructive ? color.danger : color['text-secondary'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[56px] flex-row items-center px-4 active:opacity-60"
      onPress={() =>
        Alert.alert(
          label,
          destructive
            ? 'Cancelling a job will be available soon.'
            : 'Calling and messaging will be available soon.',
        )
      }
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text variant="body" className={`ml-3 flex-1 ${destructive ? 'text-danger' : ''}`}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

export default function JobActionsScreen() {
  return (
    <Screen scrollable>
      <Text variant="label" className="mt-2">
        Contact
      </Text>
      <Card className="mt-2" padded={false}>
        <ActionRow icon="chatbubble-ellipses-outline" label="Contact customer" />
      </Card>

      <Text variant="label" className="mt-6">
        Cancel
      </Text>
      <Card className="mt-2" padded={false}>
        <ActionRow icon="close-circle-outline" label="Cancel my job" destructive />
      </Card>
    </Screen>
  );
}
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Divider, Screen, Text } from '@/components/ui';
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
  description,
  destructive = false,
}: {
  icon: IoniconName;
  label: string;
  description: string;
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
      <View className="ml-3 flex-1 pr-2">
        <Text variant="body" className={destructive ? 'text-danger' : undefined}>
          {label}
        </Text>
        <Text variant="footnote" className="mt-0.5 text-text-secondary">
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

export default function JobActionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen scrollable>
      <View className="pt-2">
        <Text variant="titleLg">Job actions</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          Choose how to handle this job.
        </Text>
      </View>

      <Card className="mt-4" padded={false}>
        <ActionRow
          icon="chatbubble-ellipses-outline"
          label="Contact customer"
          description="Reach the customer by call or message."
        />
        <Divider />
        <ActionRow
          icon="close-circle-outline"
          label="Cancel my job"
          description="Back out of this job before it is completed."
          destructive
        />
      </Card>

      <Text variant="footnote" className="mt-6 text-center text-text-muted">
        Job #{id}
      </Text>
    </Screen>
  );
}
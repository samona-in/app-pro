import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/**
 * Job actions — opened from the trip screen's call+message contact button.
 *
 * Two routes to manage the active job:
 *   - Contact customer: reach the customer by phone or message.
 *   - Cancel my job: back out of an accepted / in-flight job.
 *
 * Both call/messaging and cancellation are not yet wired to a live flow, so each
 * option surfaces a placeholder for now. The cancel row is styled destructive so
 * the intent is clear before the real cancel path lands.
 */

interface ActionOption {
  key: 'contact' | 'cancel';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  tone: 'brand' | 'danger';
}

const OPTIONS: ActionOption[] = [
  {
    key: 'contact',
    icon: 'chatbubble-ellipses',
    title: 'Contact customer',
    description: 'Reach the customer by call or message.',
    tone: 'brand',
  },
  {
    key: 'cancel',
    icon: 'close-circle',
    title: 'Cancel my job',
    description: 'Back out of this job before it is completed.',
    tone: 'danger',
  },
];

function actionRow(option: ActionOption) {
  const destructive = option.tone === 'danger';
  return (
    <Pressable
      key={option.key}
      accessibilityRole="button"
      accessibilityLabel={option.title}
      onPress={() =>
        Alert.alert(
          option.title,
          destructive
            ? 'Cancelling a job will be available soon.'
            : 'Calling and messaging will be available soon.',
        )
      }
      className="flex-row items-center gap-4 rounded-xl active:opacity-70"
    >
      <View
        className={cn(
          'h-12 w-12 items-center justify-center rounded-full',
          destructive ? 'bg-danger-surface' : 'bg-brand-soft',
        )}
      >
        <Ionicons
          name={option.icon}
          size={24}
          color={destructive ? color.danger : color.brand}
        />
      </View>
      <View className="flex-1">
        <Text
          variant="bodyLg"
          className={cn('font-semibold', destructive && 'text-danger')}
        >
          {option.title}
        </Text>
        <Text variant="footnote" className="mt-0.5 text-text-secondary">
          {option.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
    </Pressable>
  );
}

export default function JobActionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">Job actions</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          Choose how to handle this job.
        </Text>
      </View>

      <Card className="mt-6 px-5 py-3">
        <View>
          {OPTIONS.map((option, index) => (
            <View
              key={option.key}
              className={cn(
                'py-3',
                index > 0 && 'border-t border-border',
              )}
            >
              {actionRow(option)}
            </View>
          ))}
        </View>
      </Card>

      <Text variant="footnote" className="mt-4 text-center text-text-muted">
        Job #{id}
      </Text>
    </Screen>
  );
}

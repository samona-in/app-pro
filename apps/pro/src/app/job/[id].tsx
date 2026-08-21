import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { JobStatus, JOB_STATUS_TRANSITIONS } from '@samona/types';
import { Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';

/**
 * Job detail.
 *
 * Rendered from placeholder data: the timeline below reflects the shared state
 * machine in `@samona/types`, but no job is fetched and no transition is
 * performed. Status changes are always requested from the server, which
 * validates them (CLAUDE.md "Job State Machine").
 */
const TIMELINE: { status: JobStatus; label: string }[] = [
  { status: JobStatus.ACCEPTED, label: 'Accepted' },
  { status: JobStatus.TRAVELLING, label: 'On the way' },
  { status: JobStatus.ARRIVED, label: 'Arrived' },
  { status: JobStatus.IN_PROGRESS, label: 'Work in progress' },
  { status: JobStatus.COMPLETED, label: 'Completed' },
];

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Placeholder: a real screen reads this from the job returned by the API.
  const currentStatus: JobStatus = JobStatus.ACCEPTED;
  const nextStatus = JOB_STATUS_TRANSITIONS[currentStatus][0];

  return (
    <Screen scrollable edges={[]}>
      <View className="pt-4">
        <Badge label={currentStatus.replace('_', ' ')} tone="info" withDot />
        <Text variant="titleLg" className="mt-3">
          Job {id}
        </Text>
        <Text variant="footnote" className="mt-1">
          Placeholder detail — no job data is loaded yet.
        </Text>
      </View>

      <Card className="mt-6">
        <Text variant="label">Customer</Text>
        <Text variant="bodyLg" className="mt-1">
          Not loaded
        </Text>
        <Divider spaced />
        <Text variant="label">Location</Text>
        <Text variant="bodyLg" className="mt-1">
          Not loaded
        </Text>
      </Card>

      <Text variant="title" className="mt-8">
        Progress
      </Text>

      <Card className="mt-3" padded={false}>
        {TIMELINE.map((step, index) => {
          const isCurrent = step.status === currentStatus;
          return (
            <View key={step.status}>
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center px-4 py-4">
                <View
                  className={
                    isCurrent
                      ? 'mr-3 h-2.5 w-2.5 rounded-full bg-success'
                      : 'mr-3 h-2.5 w-2.5 rounded-full bg-border-strong'
                  }
                />
                <Text
                  variant={isCurrent ? 'bodyStrong' : 'body'}
                  className={isCurrent ? undefined : 'text-text-secondary'}
                >
                  {step.label}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      <View className="mt-8 gap-3">
        <Button
          label={nextStatus ? `Mark as ${nextStatus.replace('_', ' ').toLowerCase()}` : 'No action'}
          size="lg"
          disabled
        />
        <Text variant="caption" className="text-center">
          Actions activate once the jobs API is connected.
        </Text>
      </View>
    </Screen>
  );
}

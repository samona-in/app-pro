import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { JobStatus, JOB_STATUS_TRANSITIONS } from '@samona/types';
import { Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';

const TIMELINE: { status: JobStatus; label: string }[] = [
  { status: JobStatus.REQUESTED, label: 'Requested' },
  { status: JobStatus.ACCEPTED, label: 'Professional accepted' },
  { status: JobStatus.TRAVELLING, label: 'On the way' },
  { status: JobStatus.ARRIVED, label: 'Arrived' },
  { status: JobStatus.IN_PROGRESS, label: 'Work in progress' },
  { status: JobStatus.COMPLETED, label: 'Completed' },
];

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const currentStatus: JobStatus = JobStatus.REQUESTED;
  const nextStatus = JOB_STATUS_TRANSITIONS[currentStatus]?.[0];

  return (
    <Screen scrollable edges={[]}>
      <View className="pt-4">
        <Badge label={currentStatus.replace('_', ' ')} tone="info" withDot />
        <Text variant="titleLg" className="mt-3">
          Booking {id}
        </Text>
        <Text variant="footnote" className="mt-1">
          Placeholder detail — no booking data is loaded yet.
        </Text>
      </View>

      <Card className="mt-6">
        <Text variant="label">Professional</Text>
        <Text variant="bodyLg" className="mt-1">
          Not loaded
        </Text>
        <Divider spaced />
        <Text variant="label">Service</Text>
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
          Actions activate once the bookings API is connected.
        </Text>
      </View>
    </Screen>
  );
}

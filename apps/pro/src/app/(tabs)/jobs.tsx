import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isActiveJobStatus, type JobStatus } from '@samona/types';
import { EmptyState } from '@/components/feedback';
import { Card, Divider, Screen, Text } from '@/components/ui';
import { JobStatusBadge } from '@/components/jobs';
import { useProJobs } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatInr } from '@/utils/format';

const FILTERS = ['Active', 'Completed', 'All'] as const;
type Filter = (typeof FILTERS)[number];

function isActive(status: JobStatus): boolean {
  return isActiveJobStatus(status);
}

function isCompleted(status: JobStatus): boolean {
  return status === 'PAYMENT_PENDING' || status === 'PAID';
}

export default function Jobs() {
  const [filter, setFilter] = useState<Filter>('Active');
  const { data: jobs, isPending } = useProJobs();

  const visible = useMemo(() => {
    const all = jobs ?? [];
    if (filter === 'Active') return all.filter((job) => isActive(job.status));
    if (filter === 'Completed') return all.filter((job) => isCompleted(job.status));
    return all;
  }, [filter, jobs]);

  return (
    <Screen>
      <View className="pt-2">
        <Text variant="titleLg">Jobs</Text>
      </View>

      <View className="mt-4 flex-row rounded-lg bg-surface-muted p-1">
        {FILTERS.map((item) => {
          const isSelected = item === filter;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setFilter(item)}
              className={cn(
                'min-h-[40px] flex-1 items-center justify-center rounded-md',
                isSelected && 'bg-surface',
              )}
            >
              <Text
                variant="footnote"
                className={cn('font-semibold', isSelected && 'text-text-primary')}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visible.length > 0 ? (
        <Card padded={false} className="mt-4 overflow-hidden">
          {visible.map((job, index) => (
            <View key={job.id}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/job/${job.id}`)}
                className="active:bg-surface-muted"
              >
                <View className="flex-row items-center gap-3 px-4 py-4">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text variant="bodyStrong" className="flex-shrink">
                        {job.service.name}
                      </Text>
                      <JobStatusBadge status={job.status} />
                    </View>
                    <Text variant="footnote" className="mt-1 text-text-secondary" numberOfLines={1}>
                      {job.customer?.displayName ?? 'Customer'}
                      {job.customer?.locationLabel ? ` · ${job.customer.locationLabel}` : ''}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text variant="bodyStrong">
                      {formatInr(job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
                  </View>
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <View className="mt-2 flex-1">
          <EmptyState
            icon="briefcase-outline"
            title={isPending ? 'Loading your jobs' : `No ${filter.toLowerCase()} jobs`}
            message={
              filter === 'Active'
                ? 'When you accept a job, it appears here with everything you need to get to the customer.'
                : 'Completed jobs with their payouts will show up here.'
            }
          />
        </View>
      )}
    </Screen>
  );
}

import type { ReactNode } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { JobDetail } from '@samona/types';
import { Card, Divider, Text } from '@/components/ui';
import { color } from '@/theme';
import { formatInr } from '@/utils/format';

const INSTRUCTIONS = [
  'Inspect the issue',
  'Confirm the work with the customer',
  'Start only when you are ready',
];

export interface JobDetailsContentProps {
  job: JobDetail;
  /**
   * Rendered below the instruction card as a full-width footer action — the
   * "Start work" Button or the "Work Completed" swipe.
   */
  footer: ReactNode;
}

/**
 * The job-details view shown once the pro has arrived at the work spot
 * (ARRIVED) and for the duration of the work (IN_PROGRESS).
 *
 * Replaces the map + docked sheet of the travelling stages with a scrollable
 * stack of cards: the work/customer summary side by side, the job description,
 * the customer's reference photos, and a short pre-start checklist. The screen
 * header (title + message/call) is owned by the caller.
 *
 * The footer action ("Start Work" / "Work Completed") is pinned to the bottom
 * of the screen, outside the scroll area, so it stays reachable however long
 * the card stack grows.
 */
export function JobDetailsContent({ job, footer }: JobDetailsContentProps) {
  const customerName = job.customer?.displayName ?? 'Customer';
  const address =
    job.locationLabel ?? job.customer?.locationLabel ?? 'Location shared after you arrive';
  const price = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-5 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Card 1 — the work (top) and the customer (bottom), stacked vertically. */}
        <Card>
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
              <Ionicons name="construct-outline" size={22} color={color.brand} />
            </View>
            <View className="flex-1">
              <Text variant="bodyLg" className="font-semibold">
                {job.service.name}
              </Text>
              <Text variant="footnote" className="text-text-secondary">
                {job.customSkill ?? job.skill.name}
              </Text>
            </View>
            <Text variant="title" className="text-brand">
              {formatInr(price)}
            </Text>
          </View>

          <Divider spaced />

          <View className="flex-row items-start gap-3">
            <Ionicons name="person-circle-outline" size={22} color={color['text-secondary']} />
            <View className="flex-1">
              <Text variant="bodyStrong">{customerName}</Text>
              <Text variant="footnote" className="mt-0.5 text-text-secondary" numberOfLines={2}>
                {address}
              </Text>
            </View>
          </View>
        </Card>

        {/* Card 2 — job description. */}
        <Card className="mt-4 bg-surface">
          <View className="flex-row items-center gap-2">
            <Ionicons name="document-text-outline" size={18} color={color['text-secondary']} />
            <Text variant="label">Job description</Text>
          </View>
          <Text variant="body" className="mt-1 ml-[26px]">
            {job.description}
          </Text>
        </Card>

        {/* Card 3 — customer's reference photos. */}
        {job.imageUrls.length > 0 ? (
          <Card className="mt-4" padded={false}>
            <View className="flex-row items-center gap-2 px-4 pb-3 pt-4">
              <Ionicons name="images-outline" size={18} color={color['text-secondary']} />
              <Text variant="label">Customer photos</Text>
              <Text variant="caption">({job.imageUrls.length})</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="flex-row gap-2 pb-4 pr-4 pl-[42px]"
            >
              {job.imageUrls.map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  className="h-24 w-24 rounded-lg bg-surface-muted"
                />
              ))}
            </ScrollView>
          </Card>
        ) : null}

        {/* Card 4 — instructions before starting. */}
        <Card className="mt-4 bg-surface">
          <View className="flex-row items-center gap-2">
            <Ionicons name="shield-checkmark-outline" size={18} color={color['text-secondary']} />
            <Text variant="label">Before you start</Text>
          </View>
          <View className="mt-3 ml-[26px] gap-1">
            {INSTRUCTIONS.map((item) => (
              <View key={item} className="flex-row items-start">
                <View className="mr-3 mt-1.5 h-1.5 w-1.5 rounded-full bg-text-secondary" />
                <Text variant="body" className="flex-1">
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>

      {/* Footer action — pinned to the bottom so the swipe is always
          reachable, regardless of how tall the card stack gets. */}
      <View className="bg-surface px-5 py-4">{footer}</View>
    </View>
  );
}

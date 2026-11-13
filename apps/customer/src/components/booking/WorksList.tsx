import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { workSummaryLabel, type JobItem } from '@samona/types';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { formatRupees } from '@/utils/format';
import { describeJobQuantity, jobItemName } from '@/utils/pricing';

/** The per-work amount line: "3 hinges", "2 hr", or "Fixed price". */
function workQuantityLabel(item: JobItem): string {
  return (
    describeJobQuantity(item) ??
    (item.pricingModel === 'PER_HOUR' ? 'Hourly work' : 'Fixed price')
  );
}

/**
 * The works of a placed booking, as an expandable list.
 *
 * A bulk visit reads as one summary row — "Regular Tap Repair + 2 more
 * works" — that opens every work with its quantity and subtotal. A
 * single-work booking renders nothing: its one line already lives in the
 * amount caption.
 */
export function WorksList({ items }: { items: readonly JobItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length < 2) return null;

  const summary = workSummaryLabel(items.map(jobItemName));
  const toggleLabel = expanded ? `Hide the works in this booking` : `Show the works in this booking`;

  return (
    <View>
      {/* The parent already draws the separator above this section (the total's
          bottom border), so the list only closes itself at the bottom. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        className="flex-row items-center gap-3 px-5 py-3 active:opacity-70"
      >
        <Ionicons name="layers-outline" size={20} color={color['text-primary']} />
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" className="text-text-primary" numberOfLines={1}>
            {summary}
          </Text>
          <Text variant="footnote" className="mt-0.5 text-text-muted">
            {items.length} works in this booking
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={color['text-secondary']}
        />
      </Pressable>

      {expanded ? (
        <View className="px-5 pb-3">
          {items.map((item) => (
            <View key={item.id} className="flex-row items-center py-1.5">
              <View className="min-w-0 flex-1 pr-3">
                <Text variant="body" numberOfLines={1}>
                  {jobItemName(item)}
                </Text>
                <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-muted">
                  {workQuantityLabel(item)}
                </Text>
              </View>
              <Text variant="bodyStrong" numberOfLines={1} className="shrink-0">
                {formatRupees(item.subtotalPaise)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View className="h-px bg-border w-full" />
    </View>
  );
}

import { View } from 'react-native';
import { cn } from '@/utils/cn';

/**
 * The opening width of each placeholder title bar. Kept as literals (rather
 * than computed styles) so NativeWind's content scanner can see them.
 */
const TITLE_WIDTHS = ['w-2/5', 'w-3/5', 'w-1/2', 'w-2/3', 'w-1/3', 'w-1/2'];

/**
 * Placeholder rows shown while the first page of notices loads. It mirrors a
 * real row's rhythm — a tinted tile and two lines — so the header does not
 * jump when the content lands.
 */
export function NotificationSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading notifications" className="pt-6">
      {/* A stand-in for the first day heading, so rows do not jump on load. */}
      <View className="px-5 pb-3">
        <View className="h-2.5 w-16 rounded-full bg-surface-muted" />
      </View>

      {TITLE_WIDTHS.map((width, index) => (
        <View key={index} className="flex-row items-start px-5 py-[13px]">
          <View className="h-11 w-11 rounded-[14px] bg-surface-muted" />
          <View className="ml-[13px] flex-1">
            <View className={cn('h-3.5 rounded-full bg-surface-muted', width)} />
            <View className="mt-3 h-3 w-full rounded-full bg-surface-muted" />
          </View>
        </View>
      ))}
    </View>
  );
}

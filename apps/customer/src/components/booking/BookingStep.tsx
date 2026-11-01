import type { ReactNode, RefObject } from 'react';
import { View, type ScrollView, type ScrollViewProps, type ViewProps } from 'react-native';
import { router } from 'expo-router';
import { Button, IconButton, Screen, Text } from '@/components/ui';
import { cn } from '@/utils/cn';

/** Which of the four booking questions this step answers (1-indexed). */
export type BookingStepNumber = 1 | 2 | 3 | 4;

export interface BookingStepProps {
  step: BookingStepNumber;
  /** Optional so a step can lead with its own content instead of a question. */
  title?: string;
  subtitle?: string;
  /**
   * The service being booked.
   */
  service?: { name: string; icon?: string | null };
  headerExtra?: ReactNode;
  children: ReactNode;
  /** Content placed directly in the scroll view so it can remain sticky. */
  stickyContent?: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  onScroll?: ScrollViewProps['onScroll'];
  onContentLayout?: ViewProps['onLayout'];
  primaryLabel?: string;
  /** Omit to hide the footer button (e.g. a step that advances on tap). */
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  isSaving?: boolean;
  error?: string | null;
}

/**
 * Shared chrome for the booking questions.
 *
 * Each question lives on its own stacked route (skill → pay → review) so back
 * gestures behave, while this layout keeps the header, footer and error
 * treatment identical across them. The "tell us about the work" step opens as a
 * bottom sheet over the catalogue instead of a separate screen. The final
 * review step is a full-screen map with its own bottom sheet instead.
 */
export function BookingStep({
  title,
  subtitle,
  service,
  headerExtra,
  children,
  stickyContent,
  scrollRef,
  onScroll,
  onContentLayout,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled = false,
  isSaving = false,
  error,
}: BookingStepProps) {
  return (
    <Screen
      edges={['top', 'bottom']}
      scrollable
      className="bg-surface"
      padded={false}
      stickyHeaderIndices={[0, stickyContent ? 1 : -1].filter((i) => i >= 0)}
      scrollRef={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : undefined}
      contentClassName="px-2"
    >
      <View className="z-30 bg-surface">
        <View className="flex-row items-center">
          <IconButton
            name="arrow-back"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
          />
          {service ? (
            <Text variant="bodyStrong" numberOfLines={1} className="ml-1 flex-1 pr-2">
              {service.name}
            </Text>
          ) : null}
          {headerExtra}
        </View>
      </View>

      {stickyContent ? <View className="z-20 bg-surface">{stickyContent}</View> : null}

      <View onLayout={onContentLayout} className={cn('flex-1 px-2', title ? 'pt-6' : 'pt-4')}>
        {title ? <Text variant="titleLg">{title}</Text> : null}
        {subtitle ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {subtitle}
          </Text>
        ) : null}

        <View className={title ? 'mt-7' : undefined}>{children}</View>
      </View>

      {error || onPrimary ? (
        <View className="gap-3 px-2 pb-4 pt-6">
          {error ? (
            <Text variant="footnote" className="text-center text-danger">
              {error}
            </Text>
          ) : null}
          {onPrimary ? (
            <Button
              label={primaryLabel}
              size="lg"
              loading={isSaving}
              disabled={primaryDisabled}
              onPress={onPrimary}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

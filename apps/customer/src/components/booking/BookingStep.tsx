import type { ReactNode, RefObject } from 'react';
import { View, type ScrollView, type ScrollViewProps, type ViewProps } from 'react-native';
import { router } from 'expo-router';
import { Button, IconButton, Screen, Text } from '@/components/ui';
import { cn } from '@/utils/cn';

/** Which of the three booking questions this step answers (1-indexed). */
export type BookingStepNumber = 1 | 2 | 3;

export interface BookingStepProps {
  step: BookingStepNumber;
  /** Optional so a step can lead with its own content instead of a question. */
  title?: string;
  subtitle?: string;
  /**
   * A label shown as the screen's large title, with a round close button on the
   * right (the same header the notifications inbox uses). Use when the step has
   * no service context (e.g. the cross-service cart).
   */
  headerTitle?: string;
  /**
   * A quiet summary shown under `headerTitle`, like the inbox's unread count.
   */
  headerSubtitle?: string;
  /** Accessibility label for `headerTitle`'s close button. */
  headerCloseLabel?: string;
  /**
   * The service being booked.
   */
  service?: { name: string; icon?: string | null };
  headerExtra?: ReactNode;
  children: ReactNode;
  /**
   * Overrides the content area's default padding (`px-2` plus the title's top
   * space). The screen's own gutter still applies, so pass `pt-*` here when a
   * step (e.g. the cross-service cart) should sit tighter under the header.
   */
  contentClassName?: string;
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
  /**
   * Content pinned below the scrollable area (see `Screen`'s footer) — e.g.
   * the cart summary bar that must stay visible while the catalogue scrolls.
   * Renders instead of the in-scroll primary button, so pass one or the other.
   */
  footer?: ReactNode;
}

/**
 * Shared chrome for the booking questions.
 *
 * Each question lives on its own stacked route (skill → review) so back
 * gestures behave, while this layout keeps the header, footer and error
 * treatment identical across them. The "tell us about the work" step opens as a
 * bottom sheet over the catalogue instead of a separate screen. The final
 * review step is a full-screen map with its own bottom sheet instead.
 */
export function BookingStep({
  title,
  subtitle,
  headerTitle,
  headerSubtitle,
  headerCloseLabel = 'Close',
  service,
  headerExtra,
  children,
  contentClassName,
  stickyContent,
  scrollRef,
  onScroll,
  onContentLayout,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled = false,
  isSaving = false,
  error,
  footer,
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
      footer={footer}
    >
      <View className="z-30 bg-surface">
        {headerTitle ? (
          /* Inbox-style header: the large title, a round close control and an
             optional summary underneath — the same shape as notifications. */
          <View className="px-4 pb-1 pt-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="titleLg" numberOfLines={1} className="flex-1">
                {headerTitle}
              </Text>
              <IconButton
                name="close"
                accessibilityLabel={headerCloseLabel}
                variant="surface"
                size={18}
                onPress={() => router.back()}
              />
            </View>
            {headerSubtitle ? (
              <Text variant="footnote" numberOfLines={1} className="mt-1">
                {headerSubtitle}
              </Text>
            ) : null}
          </View>
        ) : (
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
        )}
      </View>

      {stickyContent ? <View className="z-20 bg-surface">{stickyContent}</View> : null}

      <View
        onLayout={onContentLayout}
        className={cn('flex-1', contentClassName ?? (title ? 'px-2 pt-6' : 'px-2 pt-4'))}
      >
        {title ? <Text variant="titleLg">{title}</Text> : null}
        {subtitle ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {subtitle}
          </Text>
        ) : null}

        <View className={title ? 'mt-7' : subtitle ? 'mt-6' : undefined}>{children}</View>
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

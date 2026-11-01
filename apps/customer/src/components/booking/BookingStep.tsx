import type { ReactNode, RefObject } from 'react';
import { View, type ScrollView, type ScrollViewProps, type ViewProps } from 'react-native';
import { router } from 'expo-router';
import { ServiceImage, isImageUrl } from '@/components/home/ServiceImage';
import { Button, IconButton, Screen, Text } from '@/components/ui';
import { cn } from '@/utils/cn';

const TOTAL_STEPS = 4;

/** Which of the four booking questions this step answers (1-indexed). */
export type BookingStepNumber = 1 | 2 | 3 | 4;

function StepProgress({ step }: { step: BookingStepNumber }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step }}
      className="mt-2 flex-row gap-1"
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View
          key={i}
          className={cn('h-1 flex-1 rounded-full', i < step ? 'bg-brand' : 'bg-border')}
        />
      ))}
    </View>
  );
}

export interface BookingStepProps {
  step: BookingStepNumber;
  /** Optional so a step can lead with its own content instead of a question. */
  title?: string;
  subtitle?: string;
  /**
   * The service being booked. When set, the top bar shows it instead of the
   * plain step counter (which moves to the right).
   */
  service?: { name: string; icon?: string | null };
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
 * Each question lives on its own stacked route (skill → details → pay)
 * so back gestures behave, while this layout keeps the header, step progress,
 * footer and error treatment identical across them. The final review step is a
 * full-screen map with its own bottom sheet instead.
 */
export function BookingStep({
  step,
  title,
  subtitle,
  service,
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
      stickyHeaderIndices={stickyContent ? [2] : undefined}
      scrollRef={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : undefined}
    >
      <View className="flex-row items-center justify-between">
        <IconButton name="arrow-back" accessibilityLabel="Go back" onPress={() => router.back()} />

        {service ? (
          <View className="flex-1 flex-row items-center justify-center gap-2 px-2">
            {isImageUrl(service.icon ?? null) ? (
              <ServiceImage uri={service.icon} className="h-6 w-6 rounded-md" />
            ) : null}
            <Text variant="bodyStrong" numberOfLines={1} className="shrink">
              {service.name}
            </Text>
          </View>
        ) : (
          <Text variant="caption" className="font-medium">
            {step} of {TOTAL_STEPS}
          </Text>
        )}

        {service ? (
          <Text variant="caption" className="font-medium">
            {step} of {TOTAL_STEPS}
          </Text>
        ) : (
          <View className="h-11 w-11" />
        )}
      </View>

      <StepProgress step={step} />

      {stickyContent ? <View className="z-20 bg-surface">{stickyContent}</View> : null}

      <View onLayout={onContentLayout} className={cn('flex-1', title ? 'pt-6' : 'pt-4')}>
        {title ? <Text variant="titleLg">{title}</Text> : null}
        {subtitle ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {subtitle}
          </Text>
        ) : null}

        <View className={title ? 'mt-7' : undefined}>{children}</View>
      </View>

      {error || onPrimary ? (
        <View className="gap-3 pb-4 pt-6">
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

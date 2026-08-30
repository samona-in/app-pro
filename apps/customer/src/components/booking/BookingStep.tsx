import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, IconButton, Screen, Text } from '@/components/ui';
import { cn } from '@/utils/cn';

const TOTAL_STEPS = 5;

/** Which of the five booking questions this step answers (1-indexed). */
export type BookingStepNumber = 1 | 2 | 3 | 4 | 5;

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
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  isSaving?: boolean;
  error?: string | null;
}

/**
 * Shared chrome for the five-step booking flow.
 *
 * Each step lives on its own stacked route (place → skill → details → pay →
 * review) so back gestures behave, while this layout keeps the header, step
 * progress, footer and error treatment identical across them.
 */
export function BookingStep({
  step,
  title,
  subtitle,
  children,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled = false,
  isSaving = false,
  error,
}: BookingStepProps) {
  return (
    <Screen edges={['top', 'bottom']} scrollable className="bg-surface">
      <View className="flex-row items-center justify-between">
        <IconButton name="arrow-back" accessibilityLabel="Go back" onPress={() => router.back()} />
        <Text variant="caption" className="font-medium">
          {step} of {TOTAL_STEPS}
        </Text>
        <View className="h-11 w-11" />
      </View>

      <StepProgress step={step} />

      <View className="flex-1 pt-6">
        <Text variant="titleLg">{title}</Text>
        {subtitle ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {subtitle}
          </Text>
        ) : null}

        <View className="mt-7">{children}</View>
      </View>

      <View className="gap-3 pb-4 pt-6">
        {error ? (
          <Text variant="footnote" className="text-center text-danger">
            {error}
          </Text>
        ) : null}
        <Button
          label={primaryLabel}
          size="lg"
          loading={isSaving}
          disabled={primaryDisabled}
          onPress={onPrimary}
        />
      </View>
    </Screen>
  );
}

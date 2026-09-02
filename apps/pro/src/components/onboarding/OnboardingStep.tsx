import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ONBOARDING_STEPS, type OnboardingStep as StepName } from '@samona/types';
import { Button, Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/**
 * Progress bar. Steps are equal width, so position reads at a glance.
 *
 * Bumble-style: a thin rail with a blue fill for the progress so far, on the
 * dark onboarding surface.
 */
function StepProgress({ step }: { step: StepName }) {
  const index = ONBOARDING_STEPS.indexOf(step);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: ONBOARDING_STEPS.length, now: index + 1 }}
      className="mt-1 flex-row gap-1"
    >
      {ONBOARDING_STEPS.map((name, i) => (
        <View
          key={name}
          className={cn(
            'h-[3px] flex-1 rounded-full',
            i <= index ? 'bg-brand' : 'bg-onboarding-border',
          )}
        />
      ))}
    </View>
  );
}

export interface OnboardingStepProps {
  step: StepName;
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  isSaving?: boolean;
  /** Shown above the button; use for save failures, not field errors. */
  error?: string | null;
  footer?: ReactNode;
}

/**
 * Shared layout for every onboarding step.
 *
 * Dark, minimal black/blue/white treatment inspired by Bumble and Rapido: a
 * bold white headline with lots of breathing room, an optional subtitle in
 * muted white, a single full-width pill CTA in SAMONA blue, and the thin
 * progress rail pinned to the top. Each screen only declares its own question.
 */
export function OnboardingStepLayout({
  step,
  title,
  subtitle,
  children,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled = false,
  isSaving = false,
  error,
  footer,
}: OnboardingStepProps) {
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ backgroundColor: color['onboarding-bg'] }}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="grow px-5 pb-8 pt-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StepProgress step={step} />

        <View className="flex-1 pt-10">
          <Text variant="titleLg" className="font-bold text-white">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" className="mt-2 text-white/60">
              {subtitle}
            </Text>
          ) : null}

          <View className="mt-10">{children}</View>
        </View>

        <View className="gap-3 pb-4 pt-8">
          {error ? (
            <Text variant="footnote" className="text-center text-red-400">
              {error}
            </Text>
          ) : null}
          <Button
            label={primaryLabel}
            size="lg"
            shape="sm"
            loading={isSaving}
            disabled={primaryDisabled}
            onPress={onPrimary}
          />
          {footer}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

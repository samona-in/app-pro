import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CUSTOMER_ONBOARDING_STEPS, type CustomerOnboardingStep as StepName } from '@samona/types';
import { Button, Screen, Text } from '@/components/ui';
import { cn } from '@/utils/cn';

function StepProgress({ step }: { step: StepName }) {
  const index = CUSTOMER_ONBOARDING_STEPS.indexOf(step);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: CUSTOMER_ONBOARDING_STEPS.length, now: index + 1 }}
      className="mt-2 flex-row gap-1"
    >
      {CUSTOMER_ONBOARDING_STEPS.map((name, i) => (
        <View
          key={name}
          className={cn('h-1 flex-1 rounded-full', i <= index ? 'bg-brand' : 'bg-border')}
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
  error?: string | null;
  footer?: ReactNode;
}

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
    <Screen edges={['top', 'bottom']} scrollable className="bg-surface">
      <StepProgress step={step} />

      <View className="flex-1 pt-8">
        <Text variant="titleLg">{title}</Text>
        {subtitle ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {subtitle}
          </Text>
        ) : null}

        <View className="mt-8">{children}</View>
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
        {footer}
      </View>
    </Screen>
  );
}

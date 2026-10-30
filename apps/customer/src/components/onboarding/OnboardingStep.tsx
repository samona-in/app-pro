import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CustomerOnboardingStep as StepName } from '@samona/types';
import { Button, Screen, Text } from '@/components/ui';
import { StepProgress } from './StepProgress';

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
      <StepProgress step={step} className="mt-2" />

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

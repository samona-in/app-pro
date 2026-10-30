import { View } from 'react-native';
import { CUSTOMER_ONBOARDING_STEPS, type CustomerOnboardingStep as StepName } from '@samona/types';
import { cn } from '@/utils/cn';

export interface StepProgressProps {
  step: StepName;
  className?: string;
}

/** The thin segmented bar that shows how far through onboarding the customer is. */
export function StepProgress({ step, className }: StepProgressProps) {
  const index = CUSTOMER_ONBOARDING_STEPS.indexOf(step);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: CUSTOMER_ONBOARDING_STEPS.length, now: index + 1 }}
      className={cn('flex-row gap-1', className)}
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

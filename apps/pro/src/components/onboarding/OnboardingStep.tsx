import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ONBOARDING_STEPS, type OnboardingStep as StepName } from '@samona/types';
import { Button, Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/**
 * Progress bar. Steps are equal width, so position reads at a glance.
 * Blue fill on a light rail, pinned to the top of every step.
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
          className={cn('h-[3px] flex-1 rounded-full', i <= index ? 'bg-brand' : 'bg-border')}
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
 * Shared layout for every onboarding step — light mode.
 *
 * Clean white surface, a bold near-black headline with lots of breathing
 * room, an optional muted subtitle, and a single full-width CTA in SAMONA
 * blue with a subtle 5px corner. The thin blue progress rail sits on top.
 * Each screen only declares its own question.
 */
export function OnboardingStepLayout({
  step,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  isSaving = false,
  error,
  footer,
}: OnboardingStepProps) {
  const { t } = useTranslation();
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ backgroundColor: color.surface }}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="grow px-5 pb-8 pt-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StepProgress step={step} />

        <View className="flex-1 pt-10">
          <Text variant="titleLg" className="font-bold text-text-primary">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" className="mt-2 text-text-secondary">
              {subtitle}
            </Text>
          ) : null}

          <View className="mt-10">{children}</View>
        </View>

        <View className="gap-3 pb-4 pt-8">
          {error ? (
            <Text variant="footnote" className="text-center text-danger">
              {error}
            </Text>
          ) : null}
          <Button
            label={primaryLabel ?? t('common.continue')}
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

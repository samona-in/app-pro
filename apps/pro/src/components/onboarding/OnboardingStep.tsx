import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Screen, Text } from '@/components/ui';

export interface OnboardingStepProps {
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
 * blue. Each screen only declares its own question.
 */
export function OnboardingStepLayout({
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
    <Screen scrollable edges={['top', 'bottom']} className="bg-surface">
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
          label={primaryLabel ?? t('common.continue')}
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

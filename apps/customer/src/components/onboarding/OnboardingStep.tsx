import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Screen, Text } from '@/components/ui';

export interface OnboardingStepProps {
  title: string;
  subtitle?: string;
  /** Optional artwork above the title, e.g. the entry-screen hero. */
  header?: ReactNode;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  isSaving?: boolean;
  error?: string | null;
  footer?: ReactNode;
}

export function OnboardingStepLayout({
  title,
  subtitle,
  header,
  children,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled = false,
  isSaving = false,
  error,
  footer,
}: OnboardingStepProps) {
  return (
    /* A header hero bleeds edge-to-edge behind the status bar, like the
       welcome screen, so the top safe-area edge is dropped only then. */
    <Screen
      edges={header ? ['bottom'] : ['top', 'bottom']}
      scrollable
      keyboardAware
      className="bg-surface"
      footer={
        /* CTA pinned below the scroll area: it rides above the keyboard
           while the step's field is being edited. */
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
      }
    >
      {header ? <StatusBar style="light" /> : null}
      {header}
      <View className="flex-1 pt-8">
        <Text variant="titleLg">{title}</Text>
        {subtitle ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {subtitle}
          </Text>
        ) : null}

        <View className="mt-8">{children}</View>
      </View>
    </Screen>
  );
}

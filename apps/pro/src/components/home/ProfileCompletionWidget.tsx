import { useCallback, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@/components/ui';
import { useProfileCompletion } from '@/hooks';
import type { TranslationKey } from '@/i18n';
import { color } from '@/theme';
import {
  type ProfileCompletionStepKey,
  type ProfileCompletionStepStatus,
} from '@/utils/profile-completion';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const STEP_LABEL_KEYS: Record<ProfileCompletionStepKey, TranslationKey> = {
  profile: 'profileCompletion.steps.profile',
  services: 'profileCompletion.steps.services',
  documents: 'profileCompletion.steps.documents',
  verification: 'profileCompletion.steps.verification',
};

const STEP_ACTION_KEYS: Record<ProfileCompletionStepKey, TranslationKey> = {
  profile: 'profileCompletion.actions.completeProfile',
  services: 'profileCompletion.actions.addServices',
  documents: 'profileCompletion.actions.uploadDocuments',
  verification: 'profileCompletion.actions.viewVerificationStatus',
};

const STATUS_LABEL_KEYS: Record<ProfileCompletionStepStatus, TranslationKey> = {
  complete: 'profileCompletion.status.complete',
  pending: 'profileCompletion.status.pending',
  rejected: 'profileCompletion.status.rejected',
  todo: 'profileCompletion.status.todo',
};

const STATUS_ICONS: Record<ProfileCompletionStepStatus, IoniconName> = {
  complete: 'checkmark-circle',
  pending: 'time-outline',
  rejected: 'alert-circle',
  todo: 'ellipse-outline',
};

const STATUS_TINTS: Record<ProfileCompletionStepStatus, string> = {
  complete: color.success,
  pending: color.warning,
  rejected: color.danger,
  todo: color['text-muted'],
};

/**
 * Home's profile completion widget.
 *
 * Progress comes from the professional's real profile, service verdicts and
 * document review states through `useProfileCompletion` — never from local
 * counters. The whole widget disappears once verification lands so a finished
 * Pro gets an uncluttered Home screen.
 */
export function ProfileCompletionWidget() {
  const { t } = useTranslation();
  const {
    steps,
    completedCount,
    totalCount,
    percent,
    isComplete,
    isVerified,
    nextStep,
    isPending,
    isError,
    refetch,
  } = useProfileCompletion();

  // Refresh when Home regains focus (returning from Documents, Manage Services
  // or another tab) so an admin verdict that landed while the Pro was away is
  // reflected immediately. The first focus is skipped because the queries are
  // already fetching on mount.
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
      void refetch();
    }, [refetch]),
  );

  // Nothing trustworthy to show yet; an error below gets its own quiet retry.
  if (isPending && !isError) return null;

  // Preferred completed state: remove the widget entirely. The Profile tab is
  // where the Verified badge lives, so Home stays focused on availability.
  // `isVerified` is checked separately so a failed documents request cannot
  // resurrect the widget for a Pro the server has already approved.
  if (isComplete || isVerified) return null;

  if (isError) {
    return (
      <View className="mt-6 flex-row items-center rounded-xl bg-surface px-4 py-3">
        <Text variant="footnote" className="flex-1 pr-3">
          {t('profileCompletion.loadError')}
        </Text>
        <Button
          label={t('common.tryAgain')}
          variant="ghost"
          size="sm"
          fullWidth={false}
          haptic={false}
          onPress={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <View className="mt-6 rounded-xl bg-surface px-4 py-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text variant="title">{t('profileCompletion.title')}</Text>
          <Text variant="footnote" className="mt-0.5">
            {t('profileCompletion.subtitle', { completed: completedCount, total: totalCount })}
          </Text>
        </View>
        <Text variant="title" className="text-brand">
          {t('profileCompletion.percent', { percent })}
        </Text>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('profileCompletion.progressLabel')}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <View className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </View>

      <View className="mt-2">
        {steps.map((step) => {
          const label = t(STEP_LABEL_KEYS[step.key]);
          const statusLabel = t(STATUS_LABEL_KEYS[step.status]);

          return (
            <Pressable
              key={step.key}
              accessibilityRole="button"
              accessibilityState={{ disabled: step.completed }}
              accessibilityLabel={`${label}, ${statusLabel}`}
              disabled={step.completed}
              onPress={() => {
                if (step.route) router.push(step.route);
              }}
              className="min-h-[44px] flex-row items-center active:opacity-60"
            >
              <Ionicons
                name={STATUS_ICONS[step.status]}
                size={20}
                color={STATUS_TINTS[step.status]}
              />
              <Text
                variant="body"
                className={`ml-3 flex-1 ${
                  step.completed ? 'text-text-secondary' : 'text-text-primary'
                }`}
              >
                {label}
              </Text>
              {step.status === 'pending' || step.status === 'rejected' ? (
                <Text
                  variant="caption"
                  className={`mr-1 font-semibold ${
                    step.status === 'pending' ? 'text-warning' : 'text-danger'
                  }`}
                >
                  {statusLabel}
                </Text>
              ) : null}
              {!step.completed ? (
                <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {nextStep ? (
        <Button
          label={t(STEP_ACTION_KEYS[nextStep.key])}
          onPress={() => {
            if (nextStep.route) router.push(nextStep.route);
          }}
          className="mt-2"
        />
      ) : null}
    </View>
  );
}

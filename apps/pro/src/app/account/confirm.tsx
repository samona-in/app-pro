import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { DeletionAccepted } from '@samona/types';
import { isApiError } from '@samona/api-client';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useConfirmDeletion, useSession } from '@/hooks';
import { formatChatTime } from '@/utils/format';
import { color } from '@/theme';

/**
 * The final, irrevocable step: redeems the single-use token the account screen
 * minted (and displayed there exactly once). The code shown here is the same
 * token carried through route params — deliberately not persisted, so a lost
 * code simply expires and a fresh one is requested.
 */
export default function ConfirmDeletionScreen() {
  const { t } = useTranslation();
  const { token, expiresAt } = useLocalSearchParams<{ token: string; expiresAt: string }>();
  const confirm = useConfirmDeletion();
  const { signOut } = useSession();
  const [accepted, setAccepted] = useState<DeletionAccepted | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runConfirm() {
    if (!token) return;
    setError(null);
    try {
      const result = await confirm.mutateAsync(token);
      setAccepted(result);
    } catch (failure) {
      setError(
        isApiError(failure) && failure.status === 410
          ? t('accountDeletion.tokenExpired')
          : t('accountDeletion.genericError'),
      );
    }
  }

  function onConfirmPressed() {
    Alert.alert(t('accountDeletion.confirmTitle'), t('accountDeletion.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('accountDeletion.confirmButton'),
        style: 'destructive',
        onPress: () => void runConfirm(),
      },
    ]);
  }

  async function onReturnToSignIn() {
    await signOut();
    router.replace('/');
  }

  if (accepted) {
    return (
      <Screen edges={['bottom']} className="bg-surface">
        <View className="flex-1 items-center justify-center px-6 py-10">
          <Ionicons name="checkmark-done-outline" size={48} color={color.brand} />
          <Text variant="titleLg" className="mt-4 text-center">
            {t('accountDeletion.successTitle')}
          </Text>
          <Text variant="body" className="mt-2 text-center text-text-secondary">
            {accepted.deferredToActiveJobs
              ? t('accountDeletion.successDeferredBody')
              : t('accountDeletion.successDoneBody')}
          </Text>
        </View>
        <Button
          label={t('accountDeletion.returnToSignIn')}
          variant="secondary"
          onPress={() => void onReturnToSignIn()}
          className="mb-4"
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable edges={['bottom']} className="bg-surface">
      <View className="pt-2">
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('accountDeletion.confirmBody')}
        </Text>
      </View>

      <Card className="mt-4">
        <Text variant="label" className="text-text-secondary">
          {t('accountDeletion.codeLabel')}
        </Text>
        <View className="mt-2 rounded-xl bg-surface-muted px-4 py-3">
          <Text variant="body" className="text-center font-mono font-semibold tracking-wide">
            {token}
          </Text>
        </View>
        <Text variant="caption" className="mt-2 text-center text-text-secondary">
          {expiresAt
            ? t('accountDeletion.codeExpiresAt', { time: formatChatTime(expiresAt) })
            : null}
        </Text>
        <Text variant="caption" className="mt-1 text-center text-text-muted">
          {t('accountDeletion.codeCaption')}
        </Text>
      </Card>

      {error ? (
        <Text variant="footnote" className="mt-3 text-center text-danger">
          {error}
        </Text>
      ) : null}

      <Button
        label={
          confirm.isPending
            ? t('accountDeletion.confirmButtonBusy')
            : t('accountDeletion.confirmButton')
        }
        variant="danger"
        loading={confirm.isPending}
        disabled={confirm.isPending}
        onPress={onConfirmPressed}
        className="mt-6"
      />
    </Screen>
  );
}

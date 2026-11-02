import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AccountDeletionScope, type DeletionAuthorization } from '@samona/types';
import { isApiError } from '@samona/api-client';
import { OTP_LENGTH } from '@samona/config';
import { Button, Card, Divider, OtpInput, Screen, Text } from '@/components/ui';
import { ErrorState, LoadingState } from '@/components/feedback';
import { usePhoneAuth, useRequestDeletionAuthorization, useSession } from '@/hooks';
import { useDeletionStatus } from '@/hooks';
import { color } from '@/theme';

/**
 * Delete account — reached from Profile settings.
 *
 * What the pro sees is driven by server state (`GET /users/me/deletion-status`),
 * never by local assumptions: the scope (pro surface vs entire identity) is
 * decided by the server from the account's shape, and re-verification appears
 * only when the server proves the session lacks a fresh OTP.
 *
 * The pro first proves identity with a fresh OTP, which mints a single-use
 * authorization token; the confirm screen then redeems it. The token is never
 * stored on the device — it travels once through route params.
 */
export default function AccountDeletionScreen() {
  const { t } = useTranslation();
  const { user, signOut } = useSession();
  const statusQuery = useDeletionStatus();
  const authorize = useRequestDeletionAuthorization();
  const phoneAuth = usePhoneAuth();

  const [reauthOpen, setReauthOpen] = useState(false);
  const [otp, setOtp] = useState('');

  function goToConfirm(authorization: DeletionAuthorization) {
    router.push({
      pathname: '/account/confirm',
      params: {
        token: authorization.token,
        expiresAt: authorization.expiresAt,
        scope: authorization.scope,
      },
    });
  }

  /** Requests a fresh authorization; when the session's OTP is stale, opens re-verification. */
  async function requestDeletion() {
    setReauthOpen(false);
    try {
      const authorization = await authorize.mutateAsync();
      goToConfirm(authorization);
    } catch (error) {
      if (isApiError(error) && error.status === 403) {
        // The 403 is the server's "re-verify your phone and retry" signal.
        setReauthOpen(true);
        setOtp('');
        void phoneAuth.sendCode(user?.phone ?? '');
        return;
      }
      Alert.alert(t('accountDeletion.title'), accountErrorCopy(error, t));
    }
  }

  async function onVerified() {
    if (otp.length < OTP_LENGTH || !user?.phone) return;
    const ok = await phoneAuth.verifyCode(user.phone, otp);
    if (!ok) return;
    // The new session's token carries a fresh `amr` claim; request again.
    await requestDeletion();
  }

  async function onReturnToSignIn() {
    await signOut();
    router.replace('/');
  }

  if (statusQuery.isPending) {
    return (
      <Screen edges={['bottom']} className="bg-surface">
        <LoadingState message={t('common.loading')} />
      </Screen>
    );
  }

  if (statusQuery.isError) {
    return (
      <Screen edges={['bottom']} className="bg-surface">
        <ErrorState onRetry={() => void statusQuery.refetch()} />
      </Screen>
    );
  }

  const status = statusQuery.data;

  if (status.deleted) {
    return (
      <TerminalState
        icon="checkmark-done-outline"
        toneIcon={color.brand}
        title={t('accountDeletion.deleted')}
        body={t('accountDeletion.deletedBody')}
        actionLabel={t('accountDeletion.returnToSignIn')}
        onAction={() => void onReturnToSignIn()}
      />
    );
  }

  if (status.failed) {
    return (
      <TerminalState
        icon="alert-circle-outline"
        toneIcon={color.danger}
        title={t('accountDeletion.failed')}
        body={t('accountDeletion.failedBody')}
      />
    );
  }

  if (status.inProgress) {
    const body =
      status.activeJobCount > 0
        ? t('accountDeletion.inProgressWithActiveJobs', { count: status.activeJobCount })
        : t('accountDeletion.inProgressBody');
    return (
      <TerminalState
        icon="hourglass-outline"
        toneIcon={color.brand}
        title={t('accountDeletion.inProgress')}
        body={body}
        actionLabel={t('common.cancel')}
        onAction={() => router.back()}
      />
    );
  }

  if (status.hasPendingAuthorization) {
    return (
      <TerminalState
        icon="time-outline"
        toneIcon={color['text-secondary']}
        title={t('accountDeletion.pending')}
        body={t('accountDeletion.pendingBody')}
        actionLabel={t('common.cancel')}
        onAction={() => router.back()}
      />
    );
  }

  return (
    <Screen scrollable edges={['bottom']} className="bg-surface">
      <View className="pt-2">
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('accountDeletion.subtitle')}
        </Text>
      </View>

      <View className="mt-4">
        <Text variant="footnote" className="text-text-secondary">
          {status.scope === AccountDeletionScope.PRO_PROFILE
            ? t('accountDeletion.scopeProProfile')
            : t('accountDeletion.scopeFullAccount')}
        </Text>

        <View className="mt-3">
          <CopyRow
            icon="close-circle-outline"
            toneIcon={color.danger}
            title={t('accountDeletion.whatIsRemoved')}
            body={t('accountDeletion.whatIsRemovedBody')}
          />
          <Divider className="-mx-5 my-3" />
          <CopyRow
            icon="shield-checkmark-outline"
            toneIcon={color.brand}
            title={t('accountDeletion.whatStays')}
            body={t('accountDeletion.whatStaysBody')}
          />
        </View>
      </View>

      {reauthOpen ? (
        <Card className="mt-4">
          <Text variant="title">{t('accountDeletion.reauthTitle')}</Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            {t('accountDeletion.reauthBody', { phone: user?.phone ?? t('common.back') })}
          </Text>
          <View className="mt-3">
            <OtpInput
              length={OTP_LENGTH}
              value={otp}
              onChange={setOtp}
              editable={!phoneAuth.isBusy && !authorize.isPending}
              error={phoneAuth.error ?? undefined}
            />
          </View>
          <Button
            label={t('accountDeletion.authorizeButton')}
            loading={phoneAuth.isBusy || authorize.isPending}
            disabled={otp.length < OTP_LENGTH}
            onPress={() => void onVerified()}
            className="mt-3"
          />
          <Button
            label={t('accountDeletion.resendCode')}
            variant="ghost"
            disabled={phoneAuth.isBusy}
            onPress={() => void phoneAuth.sendCode(user?.phone ?? '')}
          />
        </Card>
      ) : null}

      <Button
        label={t('accountDeletion.deleteButton')}
        variant="danger"
        loading={authorize.isPending}
        disabled={authorize.isPending}
        onPress={() => void requestDeletion()}
        className="mt-6"
      />
    </Screen>
  );
}

function CopyRow({
  icon,
  toneIcon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  toneIcon: string;
  title: string;
  body: string;
}) {
  return (
    <View className="flex-row">
      <Ionicons name={icon} size={20} color={toneIcon} />
      <View className="ml-3 flex-1">
        <Text variant="body" className="font-semibold">
          {title}
        </Text>
        <Text variant="footnote" className="mt-0.5 text-text-secondary">
          {body}
        </Text>
      </View>
    </View>
  );
}

function TerminalState({
  icon,
  toneIcon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  toneIcon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Screen edges={['bottom']} className="bg-surface">
      <View className="flex-1 items-center justify-center px-6 py-10">
        <Ionicons name={icon} size={48} color={toneIcon} />
        <Text variant="titleLg" className="mt-4 text-center">
          {title}
        </Text>
        <Text variant="body" className="mt-2 text-center text-text-secondary">
          {body}
        </Text>
      </View>
      {actionLabel ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} className="mb-4" />
      ) : null}
    </Screen>
  );
}

function accountErrorCopy(error: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  if (isApiError(error)) {
    if (error.status === 409) return t('accountDeletion.alreadyPending');
    if (error.status === 410) return t('accountDeletion.tokenExpired');
  }
  return t('accountDeletion.genericError');
}

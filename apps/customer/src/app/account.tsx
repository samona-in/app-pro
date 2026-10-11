import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AccountDeletionScope, type DeletionAuthorization } from '@samona/types';
import { isApiError } from '@samona/api-client';
import { OTP_LENGTH } from '@samona/config';
import { Button, Card, Divider, OtpInput, Screen, Text } from '@/components/ui';
import { ErrorState, LoadingState } from '@/components/feedback';
import { useDeletionStatus, usePhoneAuth, useRequestDeletionAuthorization, useSession } from '@/hooks';
import { color } from '@/theme';

/**
 * Delete account — reached from Profile settings.
 *
 * What the customer sees is driven by server state (`GET /users/me/deletion-status`),
 * never by local assumptions: the scope (customer surface vs. entire identity) is
 * decided by the server from the account's shape, and re-verification appears
 * only when the server proves the session lacks a fresh OTP.
 *
 * The customer first proves identity with a fresh OTP, which mints a single-use
 * authorization token; the confirm screen then redeems it. The token is never
 * stored on the device — it travels once through route params.
 */
export default function AccountDeletionScreen() {
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
      Alert.alert('Delete account', accountErrorCopy(error));
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
      <Screen edges={['bottom']}>
        <LoadingState message="Loading" />
      </Screen>
    );
  }

  if (statusQuery.isError) {
    return (
      <Screen edges={['bottom']}>
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
        title="Account deleted"
        body="This account has been deleted."
        actionLabel="Return to sign in"
        onAction={() => void onReturnToSignIn()}
      />
    );
  }

  if (status.failed) {
    return (
      <TerminalState
        icon="alert-circle-outline"
        toneIcon={color.danger}
        title="Deletion failed"
        body="We could not finish deleting your account. Please contact support to complete it."
      />
    );
  }

  if (status.inProgress) {
    const body =
      status.activeJobCount > 0
        ? `Your account is being deleted. We are waiting for ${status.activeJobCount} active booking(s) to finish first.`
        : 'Your account is being deleted. This can take a few minutes.';
    return (
      <TerminalState
        icon="hourglass-outline"
        toneIcon={color.brand}
        title="Deletion in progress"
        body={body}
        actionLabel="Close"
        onAction={() => router.back()}
      />
    );
  }

  if (status.hasPendingAuthorization) {
    return (
      <TerminalState
        icon="time-outline"
        toneIcon={color['text-secondary']}
        title="Confirmation pending"
        body="You have already started deleting this account. Confirm it to continue, or come back when the code expires."
        actionLabel="Close"
        onAction={() => router.back()}
      />
    );
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="footnote" className="mt-1 text-text-secondary">
          Deleting your account is permanent and cannot be undone.
        </Text>
      </View>

      <View className="mt-4">
        <Text variant="footnote" className="text-text-secondary">
          {status.scope === AccountDeletionScope.CUSTOMER_PROFILE
            ? 'Only your customer profile will be removed. Your professional account, bookings, reviews and messages stay.'
            : 'Your entire account will be removed, including any professional profile you have.'}
        </Text>

        <View className="mt-3">
          <CopyRow
            icon="close-circle-outline"
            toneIcon={color.danger}
            title="What is removed"
            body="Your profile details, photo, saved addresses and notifications."
          />
          <Divider className="-mx-5 my-3" />
          <CopyRow
            icon="shield-checkmark-outline"
            toneIcon={color.brand}
            title="What stays"
            body="Your booking history, reviews and messages — kept so the marketplace record stays accurate."
          />
        </View>
      </View>

      {reauthOpen ? (
        <Card className="mt-4">
          <Text variant="title">Verify your phone</Text>
          <Text variant="footnote" className="mt-1 text-text-secondary">
            {`Enter the code we sent to ${user?.phone ?? 'your phone'}.`}
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
            label="Verify and continue"
            loading={phoneAuth.isBusy || authorize.isPending}
            disabled={otp.length < OTP_LENGTH}
            onPress={() => void onVerified()}
            className="mt-3"
          />
          <Button
            label="Resend code"
            variant="ghost"
            disabled={phoneAuth.isBusy}
            onPress={() => void phoneAuth.sendCode(user?.phone ?? '')}
          />
        </Card>
      ) : null}

      <Button
        label="Delete account"
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
    <Screen edges={['bottom']}>
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

function accountErrorCopy(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 409) return 'You already have a deletion request pending.';
    if (error.status === 410) return 'That code has expired or was already used.';
  }
  return 'Something went wrong. Please try again.';
}

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVerifyStart } from '@/hooks/use-jobs';
import { color } from '@/theme';
import { Button } from '../ui/Button';
import { OtpInput } from '../ui/OtpInput';
import { Text } from '../ui/Text';

export interface VerifyStartSheetProps {
  visible: boolean;
  jobId: string;
  onClose: () => void;
}

/**
 * Bottom-sheet that verifies the start-work OTP.
 *
 * The server mints a single 4-digit code the moment the pro swipes "Start Work"
 * and shows it only to the customer (it is never returned on the pro's API
 * view). The pro reads the code off the customer's booking screen and enters it
 * here; a correct constant-time match is what advances the job ARRIVED →
 * IN_PROGRESS. Docked as a plain RN `Modal` at the bottom — no new dependency.
 */
export function VerifyStartSheet({ visible, jobId, onClose }: VerifyStartSheetProps) {
  const verify = useVerifyStart();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();

  const canSubmit = code.length === 4 && !verify.isPending;

  function handleChange(next: string) {
    setCode(next);
    if (error) setError(undefined);
  }

  function close() {
    if (verify.isPending) return;
    setCode('');
    setError(undefined);
    onClose();
  }

  async function submit() {
    if (!canSubmit) return;
    setError(undefined);
    try {
      await verify.mutateAsync({ jobId, code });
      setCode('');
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Check the code and try again.';
      setError(message);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={close}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityLabel="Close verification sheet"
          className="absolute inset-0 bg-black/50"
          onPress={close}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="rounded-t-2xl border-t border-border bg-surface px-5 pb-8 pt-2"
        >
          <View className="mx-auto mb-4 h-1 w-9 rounded-full bg-border" />

          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
              <Ionicons name="shield-checkmark-outline" size={24} color={color.brand} />
            </View>
            <View className="flex-1">
              <Text variant="title">Start Work</Text>
              <Text variant="footnote" className="text-text-secondary">
                Ask the customer for their code
              </Text>
            </View>
          </View>

          <Text variant="body" className="mt-4 text-text-secondary">
            The customer got a 4-digit verification code on their screen. Enter it
            below to confirm you’ve met and are starting.
          </Text>

          <View className="mt-5">
            <OtpInput length={4} value={code} onChange={handleChange} error={error} radius={8} />
          </View>

          <View className="mt-6">
            <Button
              label="Verify and Start Work"
              size="lg"
              loading={verify.isPending}
              disabled={!canSubmit}
              onPress={() => void submit()}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

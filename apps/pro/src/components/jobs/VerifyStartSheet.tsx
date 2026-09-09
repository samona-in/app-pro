import { useEffect, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheet,
} from '@expo/ui/community/bottom-sheet';
import { useVerifyStart } from '@/hooks/use-jobs';
import { color } from '@/theme';
import { OtpInput } from '../ui/OtpInput';
import { SwipeToConfirm } from '../ui/SwipeToConfirm';
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
 * IN_PROGRESS. Presented as a native modal sheet via @expo/ui — Jetpack
 * Compose ModalBottomSheet on Android, SwiftUI on iOS.
 */
export function VerifyStartSheet({ visible, jobId, onClose }: VerifyStartSheetProps) {
  const verify = useVerifyStart();
  const sheetRef = useRef<BottomSheet>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [focusKey, setFocusKey] = useState(0);

  // The native sheet always starts closed; open it the moment the parent asks
  // for it. Closing is driven here instead — pan-down/back/scrim or a successful
  // verify — so we never double-dismiss against the platform. Once the modal has
  // come up, bump focusKey so the (already-mounted) OTP field can take focus and
  // summon the keyboard.
  useEffect(() => {
    if (!visible) return;
    sheetRef.current?.present();
    const timer = setTimeout(() => setFocusKey((key) => key + 1), 350);
    return () => clearTimeout(timer);
  }, [visible]);

  // A presented sheet must not outlive its host screen (e.g. user navigates
  // back mid-verification): tear it down with the component.
  useEffect(() => {
    const sheet = sheetRef.current;
    return () => {
      sheet?.dismiss();
    };
  }, []);

  function handleChange(next: string) {
    setCode(next);
    if (error) setError(undefined);
    // Native sheets do not avoid the keyboard: while it is up it covers the
    // sheet's bottom edge, including the swipe-to-confirm track. Once the code
    // is complete the keyboard is no longer needed, so drop it to clear the
    // button for the swipe. Tapping the code field brings it back if needed.
    if (next.length === 4) Keyboard.dismiss();
  }

  function handleSheetClosed() {
    setCode('');
    setError(undefined);
    onClose();
  }

  async function submit() {
    if (code.length !== 4 || verify.isPending) return;
    setError(undefined);
    try {
      await verify.mutateAsync({ jobId, code });
      sheetRef.current?.dismiss();
      setCode('');
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Check the code and try again.';
      setError(message);
    }
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: color.surface }}
      onClose={handleSheetClosed}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}>
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
          The customer got a 4-digit verification code on their screen. Enter it below to confirm
          you’ve met and are starting.
        </Text>

        <View className="mt-5">
          <OtpInput
            length={4}
            value={code}
            onChange={handleChange}
            error={error}
            radius={8}
            focusKey={focusKey}
          />
        </View>

        <View className="mt-6">
          <SwipeToConfirm
            label="Verify and Start Work"
            disabled={code.length !== 4}
            loading={verify.isPending}
            onConfirm={() => void submit()}
          />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
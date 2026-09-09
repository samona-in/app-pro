import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheet,
} from '@expo/ui/community/bottom-sheet';
import { color } from '@/theme';
import { formatInr } from '@/utils/format';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

export interface CollectCashSheetProps {
  visible: boolean;
  amountPaise: number;
  /** True while the settle request is in flight on the server. */
  isPending: boolean;
  /** True once the job is PAID; the sheet shows a success beat, then `onDone`. */
  settled: boolean;
  /** Human-readable failure from the failed settle, undefined when clean. */
  errorMessage?: string;
  /** Re-runs the settle after a failure. */
  onRetry: () => void;
  /** Called after the success beat — the parent navigates home. */
  onDone: () => void;
  /** Called when the user dismisses the sheet in an idle/error state. */
  onClose: () => void;
}

/**
 * Bottom sheet for the cash-settlement step.
 *
 * The pro swipes "Collect cash" on the payment screen and this native modal
 * takes over with the amount in the spotlight: a processing animation while the
 * server walks the job to PAID, a brief success beat, then home. The pro is
 * locked in from swipe to success — the sheet re-presents itself if dismissed
 * mid-processing, and tapping away during the success beat only waits it out —
 * because closing a cash settlement early is a state they never want to half-do.
 */
export function CollectCashSheet({
  visible,
  amountPaise,
  isPending,
  settled,
  errorMessage,
  onRetry,
  onDone,
  onClose,
}: CollectCashSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);

  // The native sheet always starts closed; open it the moment the parent asks.
  useEffect(() => {
    if (!visible) return;
    sheetRef.current?.present();
  }, [visible]);

  // A presented sheet must not outlive its host screen: tear it down with the
  // component (the parent replaces the screen on success).
  useEffect(() => {
    const sheet = sheetRef.current;
    return () => {
      sheet?.dismiss();
    };
  }, []);

  // The success beat is brief and self-timed: hold, then hand the pro back to
  // the availability home.
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(onDone, 1200);
    return () => clearTimeout(timer);
  }, [settled, onDone]);

  function handleSheetClosed() {
    // Lock-in: processing and success may not be swiped away. Any other state
    // (idle before the swipe, or an error worth a retry) hands back to parent.
    if (isPending || settled) {
      sheetRef.current?.present();
      return;
    }
    onClose();
  }

  const amount = formatInr(amountPaise);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: color.surface }}
      onClose={handleSheetClosed}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}>
        {settled ? (
          /* ── Success beat ── */
          <View className="items-center pb-4">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-success">
              <Ionicons name="checkmark" size={34} color={color['text-inverse']} />
            </View>
            <Text variant="titleLg" className="mt-5">
              Payment collected
            </Text>
            <Text variant="display" className="mt-1 text-text-primary">
              {amount}
            </Text>
            <Text variant="footnote" className="mt-2 text-text-secondary">
              Nice one — on to your next job.
            </Text>
          </View>
        ) : (
          /* ── Processing (or a failed attempt) ── */
          <View className="items-center pb-4">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
              {isPending ? (
                <ActivityIndicator size="large" color={color.brand} />
              ) : (
                <Ionicons name="wallet-outline" size={30} color={color.brand} />
              )}
            </View>
            <Text variant="titleLg" className="mt-5">
              {isPending ? 'Processing payment' : 'Collecting cash'}
            </Text>
            <Text variant="display" className="mt-1 text-text-primary">
              {amount}
            </Text>
            {isPending ? (
              <Text variant="footnote" className="mt-2 text-text-secondary">
                Confirming the payment with Samona…
              </Text>
            ) : errorMessage ? (
              <>
                <Text variant="footnote" className="mt-2 text-center text-danger">
                  {errorMessage}
                </Text>
                <View className="mt-5 w-full">
                  <Button label="Try again" size="lg" onPress={onRetry} />
                </View>
              </>
            ) : null}
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

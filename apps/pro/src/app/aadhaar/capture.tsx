import { useCallback, useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AadhaarCamera,
  AadhaarImagePreview,
  AadhaarReview,
  type AadhaarFlowSource,
} from '@/components/aadhaar';
import { Text } from '@/components/ui';
import { useSubmitAadhaar } from '@/hooks/use-submit-aadhaar';
import { useAadhaarStore } from '@/stores';
import type { TranslationKey } from '@/i18n';
import { color } from '@/theme';
import {
  isCaptureStep,
  sideForStep,
  stepAfterCapture,
  stepAfterConfirm,
  stepBack,
  type AadhaarFlowStep,
  type AadhaarSide,
} from '@/utils/aadhaar-flow';
import {
  aadhaarImageErrorKey,
  cleanupAadhaarImage,
  processAadhaarCapture,
  type CapturedAadhaarPhoto,
} from '@/utils/aadhaar-image';
import { messageForDocumentError } from '@/utils/documents';

/**
 * The whole Aadhaar capture flow in one route.
 *
 * A single camera instance stays mounted underneath the preview, review and
 * permission surfaces; only the overlay changes. That is what keeps the
 * camera from restarting every time the Pro steps back to retake a side.
 *
 * Sensitive data never touches the route params: only `source` travels with
 * navigation, while the images and uploaded document ids live in the
 * in-memory store. Local files are deleted when the flow succeeds or is
 * abandoned.
 */
export default function AadhaarCaptureScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string }>();
  const source: AadhaarFlowSource = params.source === 'onboarding' ? 'onboarding' : 'profile';

  const { front, back, uploaded, setImage, clearImage } = useAadhaarStore();
  const { submit, isSubmitting, error: submitError } = useSubmitAadhaar();

  const [step, setStep] = useState<AadhaarFlowStep>('front');
  const [processing, setProcessing] = useState(false);
  const [localErrorKey, setLocalErrorKey] = useState<TranslationKey | null>(null);

  /** Discards one side's local files and in-memory reference. */
  const discardSide = useCallback(
    (side: AadhaarSide) => {
      const existing = useAadhaarStore.getState()[side];
      if (existing) cleanupAadhaarImage(existing);
      clearImage(side);
    },
    [clearImage],
  );

  /**
   * Backwards through the flow, not out of it — losing a finished photo to a
   * stray back press would be the worst possible outcome here.
   */
  const goBack = useCallback(() => {
    const previous = stepBack(step);
    if (previous === 'exit') {
      router.back();
      return;
    }

    // Backing out of a preview means the Pro wants to retake that side.
    if (step === 'front-preview') discardSide('front');
    if (step === 'back-preview') discardSide('back');

    setLocalErrorKey(null);
    setStep(previous);
  }, [discardSide, step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  // Every local file disappears with the screen. On success the store was
  // already cleared and the files already deleted, so this is a no-op then.
  useEffect(() => {
    return () => {
      const state = useAadhaarStore.getState();
      cleanupAadhaarImage(state.front);
      cleanupAadhaarImage(state.back);
      useAadhaarStore.getState().reset();
    };
  }, []);

  const handleCaptured = useCallback(
    async (photo: CapturedAadhaarPhoto) => {
      const side = sideForStep(step);
      setProcessing(true);
      setLocalErrorKey(null);

      try {
        const image = await processAadhaarCapture(photo);
        const previous = useAadhaarStore.getState()[side];
        if (previous) cleanupAadhaarImage(previous);

        setImage(side, image);
        setStep(stepAfterCapture(side));
      } catch (cause) {
        setLocalErrorKey(aadhaarImageErrorKey(cause));
      } finally {
        setProcessing(false);
      }
    },
    [setImage, step],
  );

  const handleCameraError = useCallback(() => {
    setLocalErrorKey('aadhaar.errors.camera');
  }, []);

  const handleConfirm = useCallback(() => {
    const side = sideForStep(step);
    setLocalErrorKey(null);
    setStep(stepAfterConfirm(side, Boolean(back)));
  }, [back, step]);

  const handleRetake = useCallback(
    (side: AadhaarSide) => {
      // A side that already reached the server is immutable here: uploading a
      // replacement would leave the first row behind as a duplicate.
      if (uploaded[side]) return;
      discardSide(side);
      setLocalErrorKey(null);
      setStep(side);
    },
    [discardSide, uploaded],
  );

  const handleSubmit = useCallback(async () => {
    if (!front || !back || isSubmitting) return;

    setLocalErrorKey(null);
    const success = await submit(front, back);
    if (!success) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    cleanupAadhaarImage(front);
    cleanupAadhaarImage(back);
    useAadhaarStore.getState().reset();

    router.replace({ pathname: '/aadhaar/pending', params: { source } });
  }, [back, front, isSubmitting, source, submit]);

  const submitErrorMessage = submitError ? messageForDocumentError(submitError, t) : null;
  const activeSide = sideForStep(step);

  return (
    <View className="flex-1 bg-black">
      <AadhaarCamera
        side={activeSide}
        active={isCaptureStep(step)}
        busy={processing}
        onCaptured={handleCaptured}
        onCaptureError={handleCameraError}
        onClose={goBack}
      />

      {localErrorKey && isCaptureStep(step) ? (
        <View
          className="absolute inset-x-5 rounded-xl bg-danger p-3"
          style={{ bottom: insets.bottom + 148 }}
          pointerEvents="none"
        >
          <Text variant="footnote" className="text-center font-semibold text-white">
            {t(localErrorKey)}
          </Text>
        </View>
      ) : null}

      {step === 'front-preview' && front ? (
        <View className="absolute inset-0">
          <AadhaarImagePreview
            side="front"
            image={front}
            onRetake={() => handleRetake('front')}
            onConfirm={handleConfirm}
          />
        </View>
      ) : null}

      {step === 'back-preview' && back ? (
        <View className="absolute inset-0">
          <AadhaarImagePreview
            side="back"
            image={back}
            onRetake={() => handleRetake('back')}
            onConfirm={handleConfirm}
          />
        </View>
      ) : null}

      {step === 'review' && front && back ? (
        <View className="absolute inset-0" style={{ backgroundColor: color.surface }}>
          <AadhaarReview
            images={{ front, back }}
            uploaded={uploaded}
            isSubmitting={isSubmitting}
            errorMessage={submitErrorMessage}
            onSubmit={() => void handleSubmit()}
            onRetake={handleRetake}
            onBack={goBack}
          />
        </View>
      ) : null}
    </View>
  );
}

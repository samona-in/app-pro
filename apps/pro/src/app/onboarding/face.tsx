import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { FaceCamera } from '@/components/onboarding/FaceCamera';
import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStep';
import { Button, Screen, Text } from '@/components/ui';
import { useUploadSelfie } from '@/hooks';

type Stage = 'intro' | 'scan' | 'confirm';

/**
 * Face verification step.
 *
 * The Pro is photographed live — the camera only fires once a face sits
 * steady in the guide, so a photo of a photo or of someone else doesn't pass.
 * The capture then uploads automatically; "Retake" restarts detection.
 */
export default function OnboardingFace() {
  const [stage, setStage] = useState<Stage>('intro');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const { mutate, reset, isPending, isError, isSuccess } = useUploadSelfie();

  /**
   * Exactly-once guards keyed on intent, not mutation status: deriving
   * "should we start?" from isPending/isSuccess re-fires the upload after
   * every failure, which loops the screen between spinner and error state.
   */
  const startedUploadFor = useRef<string | null>(null);
  const navigated = useRef(false);

  useEffect(() => {
    if (!capturedUri || startedUploadFor.current === capturedUri) return;
    startedUploadFor.current = capturedUri;
    mutate({ localUri: capturedUri });
  }, [capturedUri, mutate]);

  useEffect(() => {
    if (!isSuccess || navigated.current) return;
    navigated.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.push('/onboarding/review');
  }, [isSuccess]);

  function onRetake() {
    reset();
    // A retake can land on the same temp file path, so the guards must clear.
    startedUploadFor.current = null;
    navigated.current = false;
    setCapturedUri(null);
    setStage('scan');
  }

  if (stage === 'intro') {
    return (
      <OnboardingStepLayout
        step="face"
        title="Let's verify it's you"
        subtitle="We take a quick photo of your face. Customers see it before you arrive, so they know exactly who's coming to their door. It takes a few seconds."
        primaryLabel="Start face check"
        onPrimary={() => setStage('scan')}
      >
        <View className="gap-3 rounded-xl border border-border bg-surface-muted p-4">
          <Text variant="bodyStrong">Before we start</Text>
          <Text variant="body" className="text-text-secondary">
            Find a well-lit spot, remove hats or sunglasses, and hold your phone at eye level.
          </Text>
        </View>
      </OnboardingStepLayout>
    );
  }

  if (stage === 'scan') {
    return (
      <FaceCamera
        onCaptured={(uri) => {
          setCapturedUri(uri);
          setStage('confirm');
        }}
      />
    );
  }

  return (
    <Screen edges={['top', 'bottom']} className="bg-black">
      <View className="flex-1 items-center justify-center">
        {capturedUri ? (
          <Image
            source={{ uri: capturedUri }}
            className="aspect-[3/4] w-full rounded-2xl"
            resizeMode="cover"
            accessibilityLabel="Your captured verification photo"
          />
        ) : null}
        {isPending ? (
          <View className="absolute items-center gap-2 rounded-xl bg-black/60 px-6 py-4">
            <ActivityIndicator color="white" />
            <Text variant="body" className="text-white">
              Verifying…
            </Text>
          </View>
        ) : null}
      </View>

      <View className="gap-3 pb-4 pt-6">
        {isError ? (
          <Text variant="footnote" className="text-center text-danger">
            Upload failed. Check your connection and try again.
          </Text>
        ) : null}
        {isError ? (
          <Button label="Try again" onPress={() => capturedUri && mutate({ localUri: capturedUri })} disabled={!capturedUri} />
        ) : null}
        {!isPending && !isSuccess ? (
          <Button label="Retake" variant="secondary" onPress={onRetake} />
        ) : null}
      </View>
    </Screen>
  );
}

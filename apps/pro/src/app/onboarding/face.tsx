import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
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
 * The capture is then shown for approval: nothing uploads until the Pro taps
 * "Use this photo"; "Retake" restarts detection instead.
 */
export default function OnboardingFace() {
  const [stage, setStage] = useState<Stage>('intro');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const { mutate, reset, isPending, isError, isSuccess } = useUploadSelfie();

  // A completed navigation must never stack a second review screen.
  const navigated = useRef(false);

  useEffect(() => {
    if (!isSuccess || navigated.current) return;
    navigated.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.push('/onboarding/review');
  }, [isSuccess]);

  function onRetake() {
    reset();
    navigated.current = false;
    setCapturedUri(null);
    setStage('scan');
  }

  function onApprove() {
    if (capturedUri && !isPending) {
      mutate({ localUri: capturedUri });
    }
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
        <View className="gap-3 rounded-[5px] border border-onboarding-border bg-onboarding-surface p-4">
          <Text variant="bodyStrong" className="text-white">
            Before we start
          </Text>
          <Text variant="body" className="text-white/60">
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
      </View>

      <View className="gap-3 pb-4 pt-6">
        {isError ? (
          <Text variant="footnote" className="text-center text-danger">
            Upload failed. Check your connection and try again.
          </Text>
        ) : null}
        {!isSuccess ? (
          <Button
            label={isPending ? 'Uploading…' : isError ? 'Try again' : 'Use this photo'}
            loading={isPending}
            disabled={!capturedUri}
            onPress={onApprove}
          />
        ) : null}
        {!isPending && !isSuccess ? (
          <Button label="Retake" variant="secondary" onPress={onRetake} />
        ) : null}
      </View>
    </Screen>
  );
}

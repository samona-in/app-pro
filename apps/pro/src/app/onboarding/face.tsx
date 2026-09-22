import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        title={t('onboarding.face.title')}
        subtitle={t('onboarding.face.subtitle')}
        primaryLabel={t('onboarding.face.start')}
        onPrimary={() => setStage('scan')}
      >
        <View className="gap-3 rounded-[5px] border border-border bg-surface-muted p-4">
          <Text variant="bodyStrong">{t('onboarding.face.beforeTitle')}</Text>
          <Text variant="body" className="text-text-secondary">
            {t('onboarding.face.beforeMessage')}
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
            accessibilityLabel={t('onboarding.face.capturedA11y')}
          />
        ) : null}
      </View>

      <View className="gap-3 pb-4 pt-6">
        {isError ? (
          <Text variant="footnote" className="text-center text-danger">
            {t('onboarding.face.uploadFailed')}
          </Text>
        ) : null}
        {!isSuccess ? (
          <Button
            label={isPending ? t('onboarding.face.uploading') : isError ? t('onboarding.face.tryAgain') : t('onboarding.face.usePhoto')}
            loading={isPending}
            disabled={!capturedUri}
            onPress={onApprove}
          />
        ) : null}
        {!isPending && !isSuccess ? (
          <Button label={t('onboarding.face.retake')} variant="secondary" onPress={onRetake} />
        ) : null}
      </View>
    </Screen>
  );
}
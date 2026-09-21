import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useFaceDetector, type FaceGuideStatus } from '@noma4i/vision-camera-face-detector';
import type { TFunction } from 'i18next';
import { Button, Text } from '@/components/ui';
import type { FaceCameraProps } from './FaceCamera';

/** Seconds between "face is steady" and the shutter. */
const CAPTURE_COUNTDOWN_SECONDS = 3;

/**
 * Mirrors the detector's default `selfie` guide (circle at 0.5/0.42, diameter
 * 0.72 of the preview width) so the drawn ring sits exactly where the native
 * check measures the face.
 */
const GUIDE_CIRCLE = { centerX: 0.5, centerY: 0.42, size: 0.72 };

function statusMessage(status: FaceGuideStatus, t: TFunction): string {
  switch (status) {
    case 'unavailable':
      return t('faceCam.starting');
    case 'idle':
      return t('faceCam.positionFaceInCircle');
    case 'misaligned':
      return t('faceCam.centerFace');
    case 'ready':
      return t('faceCam.holdStill');
  }
}

/**
 * Live face capture: front camera with on-device face detection that
 * auto-captures once a face sits steady inside the guide — no shutter button
 * to fumble with, and no way to submit a photo of something else.
 */
export function FaceCamera({ onCaptured }: FaceCameraProps) {
  const { t } = useTranslation();
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput({ quality: 0.8 });
  const face = useFaceDetector({ preset: 'selfie', outputs: photoOutput, preview: 'screen' });
  const { width, height } = useWindowDimensions();

  const [countdown, setCountdown] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const capturingRef = useRef(false);

  // Guide geometry in screen points; identical maths to resolveGuideRect().
  const diameter = GUIDE_CIRCLE.size * width;
  const left = GUIDE_CIRCLE.centerX * width - diameter / 2;
  const top = GUIDE_CIRCLE.centerY * height - diameter / 2;

  const captureNow = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const photo = await photoOutput.capturePhotoToFile({ enableShutterSound: false }, {});
      const filePath = photo.filePath.startsWith('file://')
        ? photo.filePath
        : `file://${photo.filePath}`;
      onCaptured(filePath);
    } catch {
      // The shutter failed; restart the countdown so the flow self-heals.
      setAttempt((current) => current + 1);
    } finally {
      capturingRef.current = false;
    }
  }, [photoOutput, onCaptured]);

  // Kept behind a ref so the countdown effect below doesn't restart when
  // unrelated state (e.g. detector frames) re-renders the component.
  const captureRef = useRef(captureNow);
  useEffect(() => {
    captureRef.current = captureNow;
  }, [captureNow]);

  useEffect(() => {
    if (!hasPermission || !device || !face.ready) return;

    let remaining = CAPTURE_COUNTDOWN_SECONDS;
    let interval: ReturnType<typeof setInterval> | undefined;

    // All setState calls live inside timer callbacks: nothing runs
    // synchronously during the effect body.
    const startTimeout = setTimeout(() => {
      setCountdown(remaining);
      interval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (interval) clearInterval(interval);
          setCountdown(null);
          void captureRef.current();
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    }, 0);

    return () => {
      clearTimeout(startTimeout);
      if (interval) clearInterval(interval);
    };
  }, [hasPermission, device, face.ready, attempt]);

  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center gap-6 bg-black px-8">
        <Text variant="title" className="text-center text-white">
          {t('faceCam.permissionTitle')}
        </Text>
        <Text variant="body" className="text-center text-white/70">
          {t('faceCam.permissionMessage')}
        </Text>
        <Button label={t('faceCam.allow')} onPress={() => void requestPermission()} />
      </View>
    );
  }

  if (!device) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-black px-8">
        <Text variant="title" className="text-center text-white">
          {t('faceCam.noFrontTitle')}
        </Text>
        <Text variant="body" className="text-center text-white/70">
          {t('faceCam.noFrontMessage')}
        </Text>
      </View>
    );
  }

  if (!face.available) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-black px-8">
        <Text variant="title" className="text-center text-white">
          {t('faceCam.noDetectionTitle')}
        </Text>
        <Text variant="body" className="text-center text-white/70">
          {t('faceCam.noDetectionMessage')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Camera
        {...face.camera}
        device={device}
        isActive
        mirrorMode="on"
        style={StyleSheet.absoluteFill}
      />

      {/* Dim everything outside the guide circle. */}
      <View className="absolute inset-x-0 top-0 bg-black/55" style={{ height: Math.max(top, 0) }} />
      <View className="absolute inset-x-0 bg-black/55" style={{ top: top + diameter, bottom: 0 }} />
      <View
        className="absolute bg-black/55"
        style={{ left: 0, top, width: Math.max(left, 0), height: diameter }}
      />
      <View
        className="absolute bg-black/55"
        style={{ left: left + diameter, top, right: 0, height: diameter }}
      />

      {/* Guide ring and countdown. */}
      <View
        className="absolute rounded-full border-[3px] border-white/90"
        style={{ left, top, width: diameter, height: diameter }}
      >
        {countdown !== null ? (
          <View className="flex-1 items-center justify-center">
            <Text variant="display" className="text-white">
              {countdown}
            </Text>
          </View>
        ) : null}
      </View>

      {countdown === null && face.status === 'unavailable' ? (
        <ActivityIndicator
          className="absolute self-center"
          style={{ top: top + diameter / 2 }}
          color="white"
        />
      ) : null}

      <View
        className="absolute inset-x-0 items-center px-6"
        style={{ bottom: 64 }}
        pointerEvents="none"
      >
        <Text variant="title" className="text-center text-white">
          {statusMessage(face.status, t)}
        </Text>
        <Text variant="footnote" className="mt-1 text-center text-white/60">
          {t('faceCam.autoCapture')}
        </Text>
      </View>
    </View>
  );
}
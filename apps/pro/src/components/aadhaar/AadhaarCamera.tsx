import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconButton, Text } from '@/components/ui';
import { color } from '@/theme';
import type { AadhaarSide } from '@/utils/aadhaar-flow';
import { AADHAAR_CARD_ASPECT_RATIO } from '@/utils/aadhaar-card';
import type { CapturedAadhaarPhoto } from '@/utils/aadhaar-image';
import { AadhaarReferenceCard } from './AadhaarReferenceCard';

export interface AadhaarCameraProps {
  side: AadhaarSide;
  /** False while a preview or the review sheet covers the camera. */
  active: boolean;
  /** True from the shutter tap until the captured image is prepared. */
  busy: boolean;
  onCaptured: (photo: CapturedAadhaarPhoto) => void | Promise<void>;
  /** The camera itself failed; the screen offers a retry. */
  onCaptureError: () => void;
  onClose: () => void;
}

/**
 * Rear-camera capture for one Aadhaar side.
 *
 * The component owns only the camera concerns: permission recovery, the live
 * preview, the card-shaped frame and a guarded shutter. Image preparation and
 * the front/back state machine live outside it, so the same camera instance
 * stays mounted for the whole flow and switching sides never remounts the
 * preview.
 *
 * The preview sits in a normal, card-proportioned box on a light screen rather
 * than filling the display: the Pro sees the exact frame the guide describes,
 * with a mock card underneath to compare against. The captured photo is then
 * centre-cropped to that same frame before it is previewed or uploaded, so no
 * background or second document comes along with it.
 *
 * A ref, not state, is the duplicate-capture guard: two taps can land before a
 * React render, and the second must be dropped synchronously.
 */
export function AadhaarCamera({
  side,
  active,
  busy,
  onCaptured,
  onCaptureError,
  onClose,
}: AadhaarCameraProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [mountError, setMountError] = useState(false);

  const askForPermission = useCallback(async () => {
    setRequesting(true);
    try {
      await requestPermission();
    } finally {
      setRequesting(false);
    }
  }, [requestPermission]);

  const capture = useCallback(async () => {
    if (capturingRef.current || busy || !ready || !cameraRef.current) return;

    capturingRef.current = true;
    try {
      // Orientation correction is deliberately left on (`skipProcessing`
      // false): Expo rotates the pixels to match the device, so the preview
      // and the uploaded file agree. The image manipulator strips the
      // remaining metadata before upload.
      const photo: CameraCapturedPicture = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
        shutterSound: false,
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      if (!photo?.uri || !photo.width || !photo.height) {
        throw new Error('The camera returned no image.');
      }
      await onCaptured({ uri: photo.uri, width: photo.width, height: photo.height });
    } catch {
      onCaptureError();
    } finally {
      capturingRef.current = false;
    }
  }, [busy, onCaptureError, onCaptured, ready]);

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <StatusBar style="dark" />
        <ActivityIndicator color={color.brand} />
        <Text variant="footnote" className="mt-3 text-text-secondary">
          {t('aadhaar.capture.starting')}
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    const blocked = permission.canAskAgain === false;
    return (
      <View className="flex-1 bg-surface">
        <StatusBar style="dark" />
        <View
          className="flex-1 items-center justify-center px-8"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
            <Ionicons name="camera-outline" size={32} color={color.brand} />
          </View>
          <Text variant="title" className="text-center">
            {blocked
              ? t('aadhaar.capture.permissionBlockedTitle')
              : t('aadhaar.capture.permissionTitle')}
          </Text>
          <Text variant="body" className="mt-2 text-center text-text-secondary">
            {blocked
              ? t('aadhaar.capture.permissionBlockedBody')
              : t('aadhaar.capture.permissionBody')}
          </Text>

          <Button
            label={
              blocked
                ? t('aadhaar.capture.permissionOpenSettings')
                : t('aadhaar.capture.permissionAllow')
            }
            loading={requesting}
            onPress={() => {
              if (blocked) {
                void Linking.openSettings().catch(() => {});
              } else {
                void askForPermission();
              }
            }}
            className="mt-8"
          />
          <Button label={t('common.notNow')} variant="ghost" onPress={onClose} className="mt-2" />
        </View>
      </View>
    );
  }

  if (mountError) {
    return (
      <View className="flex-1 bg-surface">
        <StatusBar style="dark" />
        <View
          className="flex-1 items-center justify-center px-8"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-danger-surface">
            <Ionicons name="camera-reverse-outline" size={32} color={color.danger} />
          </View>
          <Text variant="title" className="text-center">
            {t('aadhaar.capture.cameraUnavailableTitle')}
          </Text>
          <Text variant="body" className="mt-2 text-center text-text-secondary">
            {t('aadhaar.capture.cameraUnavailableBody')}
          </Text>
          <Button
            label={t('common.notNow')}
            variant="secondary"
            onPress={onClose}
            className="mt-8"
          />
        </View>
      </View>
    );
  }

  const canCapture = ready && !busy;
  const title = side === 'front' ? t('aadhaar.capture.frontTitle') : t('aadhaar.capture.backTitle');

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="dark" />

      <View
        className="flex-1"
        style={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 12 }}
      >
        <View className="flex-row items-center px-4">
          <IconButton
            name="close"
            accessibilityLabel={t('aadhaar.a11y.close')}
            tint={color['text-primary']}
            onPress={onClose}
          />
          <View className="flex-1" />
          <IconButton
            name={torchOn ? 'flashlight' : 'flashlight-outline'}
            accessibilityLabel={t('aadhaar.capture.torch')}
            accessibilityState={{ selected: torchOn }}
            tint={torchOn ? color.brand : color['text-primary']}
            onPress={() => setTorchOn((current) => !current)}
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-1 pb-2"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="title" className="text-center">
            {title}
          </Text>
          <Text variant="body" className="mt-2 text-center text-text-secondary">
            {t('aadhaar.capture.description')}
          </Text>

          {/* The preview is the guide: it is card-shaped, so whatever the Pro
              sees inside it is what the frame expects. The captured bytes are
              still the full sensor image, not a crop of this box. */}
          <View
            className="mt-5 overflow-hidden rounded-2xl bg-black"
            style={{ width: '100%', aspectRatio: AADHAAR_CARD_ASPECT_RATIO }}
          >
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
              active={active}
              animateShutter={false}
              enableTorch={torchOn}
              onCameraReady={() => setReady(true)}
              onMountError={() => setMountError(true)}
            />
            <FrameGuides />
          </View>

          <AadhaarReferenceCard side={side} className="mt-5" />
        </ScrollView>

        <View className="items-center px-5 pt-3">
          {busy ? (
            <View className="mb-4 flex-row items-center rounded-full bg-surface-muted px-3 py-1.5">
              <ActivityIndicator size="small" color={color.brand} />
              <Text variant="caption" className="ml-2 text-text-secondary">
                {t('aadhaar.capture.processing')}
              </Text>
            </View>
          ) : (
            <Text variant="footnote" className="mb-4 text-center text-text-secondary">
              {ready ? t('aadhaar.capture.holdSteady') : t('aadhaar.capture.starting')}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('aadhaar.a11y.capture')}
            accessibilityState={{ disabled: !canCapture, busy: busy }}
            disabled={!canCapture}
            onPress={() => void capture()}
            className={`h-20 w-20 items-center justify-center rounded-full border-4 border-brand ${
              canCapture ? 'active:opacity-80' : 'opacity-50'
            }`}
          >
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand">
              {busy || !ready ? (
                <ActivityIndicator color={color.white} />
              ) : (
                <Ionicons name="camera" size={26} color={color.white} />
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Corner brackets inside the card-shaped preview.
 *
 * The preview box itself is the frame now, so there is no dimmed mask to draw —
 * only a quiet outline that tells the eye where the card's corners belong.
 */
function FrameGuides() {
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <View className="absolute inset-3 rounded-xl border border-white/25" />
      <View className="absolute left-3 top-3 h-6 w-6 rounded-tl-lg border-l-2 border-t-2 border-white/90" />
      <View className="absolute right-3 top-3 h-6 w-6 rounded-tr-lg border-r-2 border-t-2 border-white/90" />
      <View className="absolute bottom-3 left-3 h-6 w-6 rounded-bl-lg border-b-2 border-l-2 border-white/90" />
      <View className="absolute bottom-3 right-3 h-6 w-6 rounded-br-lg border-b-2 border-r-2 border-white/90" />
    </View>
  );
}

import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetScrollView,
  BottomSheetTextInput,
  useBottomSheetSpringConfigs,
  type BottomSheetBackgroundProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { JOB_DESCRIPTION_MAX, JOB_IMAGE_LIMIT } from '@samona/types';
import { ServiceImage, isImageUrl } from '@/components/home/ServiceImage';
import { Button, Text } from '@/components/ui';
import { uploadJobImage } from '@/services/job-images';
import type { DraftImage } from '@/stores/booking';
import { useBookingDraft } from '@/stores/booking';
import { color } from '@/theme';

/** Top radius of the sheet, matching the rest of the app's surfaces. */
const TOP_RADIUS = 24;
/** Height of the grab handle; the sheet content starts below it. */
const HANDLE_HEIGHT = 20;
/**
 * The sheet opens near full height, leaving a hint of the catalogue behind it.
 * A percentage keeps the sheet sized to its container rather than the window,
 * which avoids rounding drift on devices with unusual safe areas.
 */
const SNAP_POINTS = ['92%'];
/** The counter turns red once the description is this close to the limit. */
const DESCRIPTION_WARN_AT = 100;

const styles = StyleSheet.create({
  background: {
    backgroundColor: color.surface,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  /** The description reads as a ruled field, not a boxed input. */
  input: {
    minHeight: 80,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color['border-strong'],
  },
});

function SheetBackground({ style }: BottomSheetBackgroundProps) {
  return <View pointerEvents="none" style={[style, styles.background]} />;
}

function SheetHandle() {
  return (
    <View className="items-center justify-center" style={{ height: HANDLE_HEIGHT }}>
      <View className="h-1.5 w-10 rounded-full bg-border-strong" />
    </View>
  );
}

export interface BookingDetailsSheetProps {
  /** The work the customer picked, shown so they can confirm the context. */
  skillName: string;
  /** Artwork for the selected work, when the catalogue provides one. */
  skillIcon?: string | null;
  /** Called once the sheet has closed after a swipe or a backdrop press. */
  onClose: () => void;
  /** Called with the trimmed description when the customer continues. */
  onContinue: (description: string) => void;
}

/**
 * The "Tell us about the work" step, shown as a bottom sheet over the catalogue
 * instead of a separate screen. The customer describes the job and attaches
 * reference photos; the draft (and any in-flight uploads) lives in the booking
 * store so closing the sheet never loses work.
 */
export function BookingDetailsSheet({
  skillName,
  skillIcon,
  onClose,
  onContinue,
}: BookingDetailsSheetProps) {
  const draft = useBookingDraft();
  const insets = useSafeAreaInsets();

  const [description, setDescription] = useState(draft.description);
  const [cameraDenied, setCameraDenied] = useState(false);

  const images = draft.images;
  const hasImage = isImageUrl(skillIcon ?? null);
  const characterCount = description.length;
  const hasUploading = images.some((image) => image.uploading);
  const hasFailed = images.some((image) => image.failed);
  const canContinue = !hasUploading && !hasFailed;

  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  async function pickPhotos() {
    const remaining = JOB_IMAGE_LIMIT - images.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
    });
    if (result.canceled) return;

    for (const asset of result.assets.slice(0, remaining)) {
      addImage(asset.uri);
    }
  }

  async function takePhoto() {
    const remaining = JOB_IMAGE_LIMIT - images.length;
    if (remaining <= 0) return;

    // The camera needs your permission to capture photos of the work; the
    // photo never leaves the device except to storage when you submit the job.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraDenied(true);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.back,
      quality: 0.7,
    });
    if (result.canceled) return;
    if (result.assets[0]) addImage(result.assets[0].uri);
  }

  function addImage(uri: string) {
    draft.setImages((prev) => [...prev, { uri, path: null, uploading: true, failed: false }]);
    void upload(uri);
  }

  async function upload(uri: string) {
    try {
      const path = await uploadJobImage(uri);
      updateImage(uri, { path, uploading: false, failed: false });
    } catch {
      updateImage(uri, { uploading: false, failed: true });
    }
  }

  function updateImage(uri: string, patch: Partial<DraftImage>) {
    draft.setImages((prev) =>
      prev.map((image) => (image.uri === uri ? { ...image, ...patch } : image)),
    );
  }

  function removeImage(uri: string) {
    draft.setImages((prev) => prev.filter((image) => image.uri !== uri));
  }

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    onContinue(description.trim());
  }, [canContinue, description, onContinue]);

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <View
          className="border-t border-border bg-surface px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button
            label="Continue"
            size="lg"
            disabled={!canContinue}
            onPress={handleContinue}
            haptic={canContinue}
          />
        </View>
      </BottomSheetFooter>
    ),
    [insets.bottom, canContinue, handleContinue],
  );

  return (
    <BottomSheet
      index={0}
      snapPoints={SNAP_POINTS}
      enableOverDrag={false}
      enablePanDownToClose
      enableDynamicSizing={false}
      animationConfigs={springConfig}
      backgroundComponent={SheetBackground}
      handleComponent={SheetHandle}
      footerComponent={renderFooter}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
          opacity={0.4}
        />
      )}
      onClose={onClose}
      onChange={(index) => {
        if (index === 0) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableFooterMarginAdjustment
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
      >
        <View className="-mx-5 pb-6">
          {hasImage ? (
            <ServiceImage uri={skillIcon} accessibilityLabel={skillName} className="h-56 w-full" />
          ) : (
            <View className="h-56 w-full items-center justify-center bg-surface-muted">
              <Ionicons name="pricetag-outline" size={40} color={color['text-secondary']} />
            </View>
          )}
          <Text variant="titleLg" numberOfLines={2} className="mt-4 px-5">
            {skillName}
          </Text>
        </View>

        <View>
          <Text variant="label">
            Describe the work{' '}
            <Text variant="caption" className="normal-case tracking-normal">
              (optional)
            </Text>
          </Text>
          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={JOB_DESCRIPTION_MAX}
            placeholder="e.g. One of the kitchen switches sizzles and cuts off power when we plug in the microwave."
            placeholderTextColor={color['text-muted']}
            textAlignVertical="top"
            accessibilityLabel="Describe the work"
            className="mt-1 w-full text-body text-text-primary"
            style={styles.input}
          />
          <Text
            variant="caption"
            className={
              characterCount > DESCRIPTION_WARN_AT
                ? 'mt-1 text-right text-danger'
                : 'mt-1 text-right'
            }
          >
            {characterCount}/{JOB_DESCRIPTION_MAX}
          </Text>
        </View>

        <View className="mt-6">
          <Text variant="label">
            Reference photos{' '}
            <Text variant="caption" className="normal-case tracking-normal">
              (optional, up to {JOB_IMAGE_LIMIT})
            </Text>
          </Text>

          <View className="mt-3 flex-row flex-wrap gap-3">
            {images.map((image) => (
              <View
                key={image.uri}
                className="relative h-24 w-24 overflow-hidden rounded-lg bg-surface-muted"
              >
                <Image source={{ uri: image.uri }} className="h-24 w-24" />
                {image.uploading ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    <ActivityIndicator size="small" color="#ffffff" />
                  </View>
                ) : image.failed ? (
                  <Pressable
                    onPress={() => {
                      updateImage(image.uri, { uploading: true, failed: false });
                      void upload(image.uri);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry photo upload"
                    className="absolute inset-0 items-center justify-center bg-danger/70"
                  >
                    <Ionicons name="cloud-upload-outline" size={22} color="#ffffff" />
                    <Text variant="caption" className="mt-0.5 text-white">
                      Retry
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => removeImage(image.uri)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 active:opacity-70"
                >
                  <Ionicons name="close" size={14} color="#ffffff" />
                </Pressable>
              </View>
            ))}

            {images.length < JOB_IMAGE_LIMIT ? (
              <>
                <Pressable
                  onPress={() => void takePhoto()}
                  accessibilityRole="button"
                  accessibilityLabel="Take a photo"
                  className="h-24 w-24 items-center justify-center rounded-lg border border-dashed border-border-strong active:opacity-70"
                >
                  <Ionicons name="camera-outline" size={22} color={color['text-secondary']} />
                  <Text variant="caption" className="mt-1">
                    Camera
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void pickPhotos()}
                  accessibilityRole="button"
                  accessibilityLabel="Choose photos from gallery"
                  className="h-24 w-24 items-center justify-center rounded-lg border border-dashed border-border-strong active:opacity-70"
                >
                  <Ionicons name="images-outline" size={22} color={color['text-secondary']} />
                  <Text variant="caption" className="mt-1">
                    {images.length === 0 ? 'Gallery' : `${images.length}/${JOB_IMAGE_LIMIT}`}
                  </Text>
                </Pressable>
              </>
            ) : null}

            {cameraDenied ? (
              <Text variant="footnote" className="w-full text-danger">
                Camera access is off. Enable it in Settings to capture photos of the work.
              </Text>
            ) : null}
          </View>

          {hasFailed ? (
            <Text variant="footnote" className="mt-2 text-danger">
              One upload could not be completed. Retry it or remove the photo.
            </Text>
          ) : null}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

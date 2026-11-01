import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { JOB_DESCRIPTION_MIN, JOB_IMAGE_LIMIT } from '@samona/types';
import { BookingStep } from '@/components/booking';
import { Text } from '@/components/ui';
import { uploadJobImage } from '@/services/job-images';
import type { DraftImage } from '@/stores/booking';
import { useBookingDraft } from '@/stores/booking';
import { color } from '@/theme';

export default function BookingDetails() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const draft = useBookingDraft();
  const [description, setDescription] = useState(draft.description);
  const [cameraDenied, setCameraDenied] = useState(false);

  const images = draft.images;
  const wordCount = description.trim().length;
  const hasUploading = images.some((image) => image.uploading);
  const hasFailed = images.some((image) => image.failed);
  const canContinue = wordCount >= JOB_DESCRIPTION_MIN && !hasUploading && !hasFailed;

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

  function onContinue() {
    if (!canContinue) return;
    draft.setDescription(description.trim());
    router.push(`/booking/new/${slug}/pay`);
  }

  return (
    <BookingStep
      step={2}
      title="Tell us about the work"
      subtitle="Describe the problem or job clearly — reference photos help nearby professionals scope it accurately."
      primaryDisabled={!canContinue}
      onPrimary={() => void onContinue()}
    >
      <View>
        <View>
          <Text variant="label">Describe the work</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="e.g. One of the kitchen switches sizzles and cuts off power when we plug in the microwave."
            placeholderTextColor={color['text-muted']}
            textAlignVertical="top"
            accessibilityLabel="Describe the work"
            className="mt-1.5 min-h-[140px] w-full rounded-lg border border-border bg-surface p-4 text-body text-text-primary"
          />
          <Text
            variant="footnote"
            className={wordCount >= JOB_DESCRIPTION_MIN ? 'mt-1.5' : 'mt-1.5 text-warning'}
          >
            {wordCount >= JOB_DESCRIPTION_MIN
              ? `${wordCount} characters`
              : `Describe at least ${JOB_DESCRIPTION_MIN} characters (${wordCount}/${JOB_DESCRIPTION_MIN})`}
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
      </View>
    </BookingStep>
  );
}

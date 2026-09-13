import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { Avatar, Input, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState, useUploadAvatar } from '@/hooks';
import { color } from '@/theme';

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Marathi', 'Bengali'];

export default function OnboardingAbout() {
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  const uploadAvatar = useUploadAvatar();

  const [bio, setBio] = useSeededState<string>(profile?.bio, '');
  const [languages, setLanguages] = useSeededState<string[]>(profile?.languages, []);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const avatarUri = previewUri ?? profile?.avatarUrl ?? null;
  const uploading = previewUri !== null || uploadAvatar.isPending;

  function toggleLanguage(language: string) {
    setLanguages(
      languages.includes(language)
        ? languages.filter((item: string) => item !== language)
        : [...languages, language],
    );
  }

  /**
   * The profile photo is the one thing a Pro can set only here — there is no
   * edit afterwards — so choose once, upload it (which records it), and the
   * saved bio/languages ride along on Continue.
   */
  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    setPreviewUri(asset.uri);
    uploadAvatar.mutate(
      { localUri: asset.uri, mimeType: asset.mimeType },
      {
        onSuccess: () => {
          setPreviewUri(null);
        },
        onError: () => {
          setPreviewUri(null);
          Alert.alert('Could not update photo', 'The photo did not upload. Please try again.');
        },
      },
    );
  }

  async function onContinue() {
    // Both fields are optional: this step should never block a Pro who is
    // otherwise ready to work.
    await save.mutateAsync({ bio: bio.trim(), languages });
    router.push('/onboarding/review');
  }

  return (
    <OnboardingStepLayout
      step="about"
      title="Tell customers about yourself"
      subtitle="Choose a profile photo and a short introduction. You can skip the rest."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? 'Could not save. Please try again.' : null}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose profile photo"
        disabled={uploading}
        onPress={() => void pickAvatar()}
        className="mb-6 self-center active:opacity-70"
      >
        <View className="relative">
          <Avatar name={profile?.displayName ?? 'SAMONA Pro'} uri={avatarUri} size="xl" />
          {uploading ? (
            <View className="absolute inset-0 items-center justify-center rounded-full bg-black/40">
              <ActivityIndicator size="small" color="#ffffff" />
            </View>
          ) : (
            <View className="absolute -bottom-0.5 -right-0.5 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-brand">
              <Ionicons name="camera" size={15} color={color['brand-contrast']} />
            </View>
          )}
        </View>
        <Text variant="caption" className="mt-2 text-center text-text-secondary">
          Customers will see this photo
        </Text>
      </Pressable>

      <Input
        label="About you"
        value={bio}
        onChangeText={setBio}
        placeholder="e.g. 8 years repairing split and window ACs across Hyderabad."
        multiline
        numberOfLines={4}
        maxLength={600}
        editable={!save.isPending}
        className="min-h-[112px] py-3"
        hint={`${bio.length}/600`}
      />

      <Text variant="label" className="mt-8">
        Languages you speak
      </Text>
      <View className="mt-3 gap-3">
        {LANGUAGES.map((language) => (
          <SelectableCard
            key={language}
            label={language}
            selected={languages.includes(language)}
            onToggle={() => toggleLanguage(language)}
          />
        ))}
      </View>
    </OnboardingStepLayout>
  );
}

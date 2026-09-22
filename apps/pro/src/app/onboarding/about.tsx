import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { Avatar, Input, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState, useUploadAvatar } from '@/hooks';
import { color } from '@/theme';

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Marathi', 'Bengali'];

export default function OnboardingAbout() {
  const { t } = useTranslation();
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
          Alert.alert(t('onboarding.about.photoAlertTitle'), t('onboarding.about.photoAlertMessage'));
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
      title={t('onboarding.about.title')}
      subtitle={t('onboarding.about.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? t('onboarding.about.saveError') : null}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.about.choosePhotoA11y')}
        disabled={uploading}
        onPress={() => void pickAvatar()}
        className="mb-6 self-center active:opacity-70"
      >
        <View className="relative">
          <Avatar name={profile?.displayName ?? t('brand.samonaPro')} uri={avatarUri} size="xl" />
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
          {t('onboarding.about.photoCaption')}
        </Text>
      </Pressable>

      <Input
        label={t('onboarding.about.aboutYou')}
        value={bio}
        onChangeText={setBio}
        placeholder={t('onboarding.about.bioPlaceholder')}
        multiline
        numberOfLines={4}
        maxLength={600}
        editable={!save.isPending}
        className="min-h-[112px] py-3"
        hint={`${bio.length}/600`}
      />

      <Text variant="label" className="mt-8">
        {t('onboarding.about.languagesLabel')}
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
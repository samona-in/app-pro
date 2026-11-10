import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LOCATION_DEFAULTS } from '@samona/config';
import { OnboardingStepLayout } from '@/components/onboarding';
import { ServiceRadiusSlider, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

/**
 * "How far will you travel?", asked with the same slider as the profile's
 * Service area screen so the control reads identically in both places.
 *
 * The slider owns the thumb while it is dragged; the chosen whole kilometre is
 * saved when the Pro continues, keeping the step's save-on-Continue contract.
 */
export default function OnboardingRadius() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();

  const [radius, setRadius] = useSeededState<number>(
    profile?.serviceRadiusKm,
    LOCATION_DEFAULTS.serviceRadiusKm,
  );

  async function onContinue() {
    await save.mutateAsync({ serviceRadiusKm: radius });
    router.push('/onboarding/about');
  }

  return (
    <OnboardingStepLayout
      title={t('onboarding.radius.title')}
      subtitle={t('onboarding.radius.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? t('onboarding.radius.saveError') : null}
    >
      <View>
        <View className="flex-row items-center">
          <Text variant="body" className="flex-1 font-semibold">
            {t('onboarding.radius.current')}
          </Text>
          <Text variant="titleLg">{t('format.km', { value: radius })}</Text>
        </View>

        <View className="mt-4">
          <ServiceRadiusSlider
            value={radius}
            min={LOCATION_DEFAULTS.minServiceRadiusKm}
            max={LOCATION_DEFAULTS.maxServiceRadiusKm}
            disabled={save.isPending}
            onValueChange={setRadius}
            onRelease={setRadius}
            accessibilityLabel={t('onboarding.radius.sliderA11y')}
          />
          <View className="mt-2 flex-row justify-between px-5">
            <Text variant="footnote" className="text-text-muted">
              {t('format.km', { value: LOCATION_DEFAULTS.minServiceRadiusKm })}
            </Text>
            <Text variant="footnote" className="text-text-muted">
              {t('format.km', { value: LOCATION_DEFAULTS.maxServiceRadiusKm })}
            </Text>
          </View>
        </View>
      </View>
    </OnboardingStepLayout>
  );
}

import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LOCATION_DEFAULTS } from '@samona/config';
import { OnboardingStepLayout } from '@/components/onboarding';
import { ServiceRadiusWheel, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

/**
 * "How far will you travel?", asked with a wheel so the Pro can dial in a whole
 * kilometre instead of dragging a thumb.
 *
 * The wheel owns the selection while it spins; the chosen kilometre is saved
 * when the Pro continues, keeping the step's save-on-Continue contract.
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
      <View className="items-center">
        <View className="w-full">
          <ServiceRadiusWheel
            value={radius}
            min={LOCATION_DEFAULTS.minServiceRadiusKm}
            max={LOCATION_DEFAULTS.maxServiceRadiusKm}
            disabled={save.isPending}
            onChange={setRadius}
            accessibilityLabel={t('onboarding.radius.wheelA11y')}
          />
        </View>

        <View className="mt-4 w-full flex-row justify-between px-5">
          <Text variant="footnote" className="text-text-muted">
            {t('format.km', { value: LOCATION_DEFAULTS.minServiceRadiusKm })}
          </Text>
          <Text variant="footnote" className="text-text-muted">
            {t('format.km', { value: LOCATION_DEFAULTS.maxServiceRadiusKm })}
          </Text>
        </View>
      </View>
    </OnboardingStepLayout>
  );
}

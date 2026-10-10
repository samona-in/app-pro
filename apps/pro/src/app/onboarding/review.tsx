import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  EXPERIENCE_LEVELS,
  GENDER_OPTIONS,
  isProProfileComplete,
  nextIncompleteStep,
} from '@samona/types';
import { LoadingState } from '@/components/feedback';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Avatar, Badge, Text } from '@/components/ui';
import { useCatalogue, useProProfile, useSession } from '@/hooks';

/**
 * The review step reads as two clean lists — the pro's identity in a soft
 * band, then a plain divider-separated summary — with an unboxed "About you"
 * block beneath. No cards, mirroring the customer app's list language.
 */
function SummaryList({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}

export default function OnboardingReview() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const catalogue = useCatalogue();
  const { refetch } = useSession();

  const summary = useMemo(() => {
    if (!profile || !catalogue.data) return null;

    const names = (ids: string[], from: { id: string; name: string }[]) =>
      from.filter((item) => ids.includes(item.id)).map((item) => item.name);

    return {
      gender: GENDER_OPTIONS.find((option) => option.value === profile.gender)?.label ?? '—',
      services: names(profile.serviceIds, catalogue.data.services),
      skills: names(profile.skillIds, catalogue.data.skills),
      experience:
        EXPERIENCE_LEVELS.find((level) => level.value === profile.experienceLevel)?.label ?? '—',
    };
  }, [profile, catalogue.data]);

  if (!profile || !summary) {
    return <LoadingState message={t('onboarding.loadingProfile')} />;
  }

  const complete = isProProfileComplete(profile);

  const rows = [
    { label: t('onboarding.review.gender'), value: summary.gender },
    { label: t('onboarding.review.services'), value: summary.services.join(', ') || '—' },
    { label: t('onboarding.review.specialties'), value: summary.skills.join(', ') || '—' },
    {
      label: t('onboarding.review.travelsUpTo', {
        distance: t('format.km', { value: profile.serviceRadiusKm }),
      }),
      value: '',
    },
    { label: t('onboarding.review.languages'), value: profile.languages.join(', ') || '—' },
  ];

  /**
   * The server already recomputed status on the last save, so finishing is a
   * refetch and a redirect rather than another write. If something is still
   * missing, send the Pro to that step instead of into a broken home screen.
   */
  async function onFinish() {
    if (!complete) {
      router.push(`/onboarding/${nextIncompleteStep(profile ?? null)}`);
      return;
    }
    await refetch();
    router.replace('/home');
  }

  return (
    <OnboardingStepLayout
      step="review"
      title={complete ? t('onboarding.review.readyTitle') : t('onboarding.review.almostThere')}
      subtitle={
        complete ? t('onboarding.review.readyMessage') : t('onboarding.review.incompleteMessage')
      }
      primaryLabel={
        complete ? t('onboarding.review.goToDashboard') : t('onboarding.review.finishRemaining')
      }
      onPrimary={() => void onFinish()}
    >
      <View className="-mx-5 bg-surface-muted px-5 py-4">
        <View className="flex-row items-center">
          <Avatar
            name={profile.displayName ?? t('brand.samonaPro')}
            size="lg"
            uri={profile.selfiePhotoUrl}
          />
          <View className="ml-4 flex-1">
            <Text variant="title">{profile.displayName ?? t('onboarding.review.yourName')}</Text>
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
              {summary.experience}
            </Text>
            <Badge
              label={complete ? t('onboarding.review.ready') : t('onboarding.review.incomplete')}
              tone={complete ? 'success' : 'warning'}
              className="mt-2"
            />
          </View>
        </View>
      </View>

      <SummaryList>
        {rows.map((row, index) => (
          <View key={row.label}>
            <View className="flex-row items-start justify-between py-3">
              <Text variant="body" className="mr-4 text-text-secondary">
                {row.label}
              </Text>
              <Text variant="bodyStrong" className="flex-1 text-right text-text-primary">
                {row.value}
              </Text>
            </View>
            {index < rows.length - 1 ? <View className="-mx-5 h-px bg-border" /> : null}
          </View>
        ))}
      </SummaryList>

      {profile.bio ? (
        <View className="mt-6">
          <Text variant="label">{t('onboarding.review.aboutYou')}</Text>
          <Text variant="body" className="mt-2 text-text-secondary">
            {profile.bio}
          </Text>
        </View>
      ) : null}

      <Text variant="caption" className="mt-4 text-text-muted">
        {t('onboarding.review.footerNote')}
      </Text>
    </OnboardingStepLayout>
  );
}

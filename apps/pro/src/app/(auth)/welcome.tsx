import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import welcomeBackground from '@/assets/images/welcome-background.jpg';
import softBottomFade from '@/assets/images/soft-bottom-fade.png';
import samonaTechnician from '@/assets/images/samona_technician.webp';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Screen, Text } from '@/components/ui';

/** Intrinsic aspect ratio of samona_technician.webp (width / height). */
const IMAGE_ASPECT = 900 / 968;
const IMAGE_MAX_WIDTH = 260;

/** Deep blue from the top of `welcome-background.jpg`, reused for the CTA. */
const HERO_BLUE = '#2A5FE0';

/**
 * First screen a signed-out Pro sees, opening on the brand the way the
 * customer app does: a full-bleed background, the professional artwork, and
 * the two entry points pinned above the fold.
 *
 * Both buttons lead to the same place: a professional entering their number
 * does not know whether they already have an account, and Supabase creates
 * one on first verification, so the phone flow resolves it either way.
 */
export default function Welcome() {
  const { t } = useTranslation();

  function continueToPhone() {
    router.push('/phone');
  }

  return (
    <Screen
      edges={['top', 'bottom']}
      className="bg-surface"
      background={
        <Image
          source={welcomeBackground}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
        />
      }
    >
      <StatusBar style="light" />

      <View className="flex-1">
        <Wordmark size="lg" inverse className="mt-8" />

        <View className="mt-2 items-center">
          <View style={{ width: '100%', maxWidth: IMAGE_MAX_WIDTH }}>
            <Image
              source={samonaTechnician}
              style={{ width: '100%', aspectRatio: IMAGE_ASPECT }}
              contentFit="contain"
              transition={200}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('welcome.imageAlt')}
            />
            {/* Dissolves the illustration's flat cut-out edge into the page. */}
            <Image
              source={softBottomFade}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%' }}
              contentFit="fill"
              accessible={false}
            />
          </View>
        </View>

        <Text variant="titleLg" className="-mt-2 text-center">
          {t('welcome.heading')}
        </Text>
        <Text variant="footnote" className="mt-3 text-center text-text-secondary">
          {t('welcome.subheading')}
        </Text>
      </View>

      <View className="gap-3 pb-4">
        <Button
          label={t('welcome.getStarted')}
          size="lg"
          backgroundColor={HERO_BLUE}
          onPress={continueToPhone}
        />
        <Button label={t('welcome.haveAccount')} variant="ghost" onPress={continueToPhone} />
        <Text variant="caption" className="mt-2 text-center">
          {t('welcome.otpVerify', { otpLength: OTP_LENGTH })}
        </Text>
      </View>
    </Screen>
  );
}

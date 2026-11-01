import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
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

const DESCRIPTION =
  'SAMONA connects you with skilled professionals in your neighbourhood, so you can find who you need, book a time that suits you, and track your booking in real time.';

export default function Welcome() {
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
              accessibilityLabel="A SAMONA professional on the way to a customer"
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
          Services, at your doorstep.
        </Text>
        <Text variant="footnote" className="mt-3 text-center text-text-secondary">
          {DESCRIPTION}
        </Text>
      </View>

      <View className="gap-3 pb-4">
        <Button
          label="Get started"
          size="lg"
          backgroundColor={HERO_BLUE}
          onPress={continueToPhone}
        />
        <Button label="I already have an account" variant="ghost" onPress={continueToPhone} />
        <Text variant="caption" className="mt-2 text-center">
          We&apos;ll verify your phone number with a {OTP_LENGTH}-digit code.
        </Text>
      </View>
    </Screen>
  );
}

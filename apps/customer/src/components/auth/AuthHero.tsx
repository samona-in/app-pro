import { View } from 'react-native';
import { Image } from 'expo-image';
import authHero from '@/assets/images/auth-hero.webp';
import { cn } from '@/utils/cn';

/** Source artwork is 1086 × 1150; its top band is the artwork's own solid
 *  brand blue, so it reads as the status-bar area of a full-bleed hero. */
const HERO_ASPECT = 1086 / 1150;

export interface AuthHeroProps {
  /** Layout tweaks from the host screen, e.g. extra bottom spacing. */
  className?: string;
}

/**
 * Edge-to-edge artwork that opens the entry screens (phone login, OTP
 * verify, onboarding name) the way the welcome screen opens on its
 * full-bleed background, so they land on the brand instead of empty space.
 *
 * - `-mx-5` cancels the screen's horizontal padding, so the artwork spans
 *   the full device width and touches both screen edges.
 * - Host screens drop the top safe-area edge (`edges={['bottom']}`), so the
 *   hero starts at the very top of the screen, behind the status bar —
 *   like the welcome screen's background.
 *
 * Decorative on purpose: the screen title carries the meaning, so screen
 * readers skip the artwork.
 */
export function AuthHero({ className }: AuthHeroProps) {
  return (
    <View className={cn('-mx-5', className)}>
      <Image
        source={authHero}
        style={{ width: '100%', aspectRatio: HERO_ASPECT }}
        contentFit="cover"
        transition={200}
        accessible={false}
      />
    </View>
  );
}

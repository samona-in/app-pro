import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import instagramIcon from '@/assets/images/instagram.png';
import { Text } from '@/components/ui';
import { openExternalUrl } from '@/utils/open-url';

/** SAMONA's public Instagram profile. */
const INSTAGRAM_URL = 'https://www.instagram.com/samona.in';

/** The supplied square brand artwork is rendered small, without cropping. */
const ICON_SIZE = 20;

const FAIL_TITLE = 'Could not open page';
const FAIL_MESSAGE = 'Check your connection and try again.';

export interface InstagramLinkProps {
  className?: string;
}

/** The small social follow link that closes the customer home. */
export function InstagramLink({ className }: InstagramLinkProps) {
  return (
    <View className={className}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open SAMONA on Instagram"
        onPress={() => openExternalUrl(INSTAGRAM_URL, FAIL_TITLE, FAIL_MESSAGE)}
        className="min-h-[44px] flex-row items-center justify-center active:opacity-60"
      >
        <Image
          source={instagramIcon}
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
          contentFit="contain"
          transition={0}
          cachePolicy="memory-disk"
          testID="instagram-icon"
        />
        <Text variant="caption" className="ml-2 font-semibold text-brand">
          @samona.in
        </Text>
      </Pressable>
    </View>
  );
}

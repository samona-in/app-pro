import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import instagramIcon from '@/assets/images/instagram.png';
import { Text } from '@/components/ui';
import { openExternalUrl } from '@/utils/open-url';

/** SAMONA's public Instagram profile. */
const INSTAGRAM_URL = 'https://www.instagram.com/samona.in';

/** The attached square brand artwork is rendered small, without cropping. */
const ICON_SIZE = 20;

export interface InstagramLinkProps {
  className?: string;
}

/** The small social follow link that closes the pro home sheet. */
export function InstagramLink({ className }: InstagramLinkProps) {
  const { t } = useTranslation();

  return (
    <View className={className}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('dashboard.sheet.instagramA11y')}
        onPress={() =>
          openExternalUrl(
            INSTAGRAM_URL,
            t('helpSupport.errors.pageFailedTitle'),
            t('helpSupport.errors.pageFailedMessage'),
          )
        }
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

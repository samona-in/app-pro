import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InstagramIcon } from '@/components/home/InstagramIcon';
import { Text } from '@/components/ui';
import { openExternalUrl } from '@/utils/open-url';

/** SAMONA's public Instagram profile. */
const INSTAGRAM_URL = 'https://www.instagram.com/samona.in';

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
        <InstagramIcon size={20} />
        <Text variant="caption" className="ml-2 font-semibold text-brand">
          @samona.in
        </Text>
      </Pressable>
    </View>
  );
}

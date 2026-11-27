import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { color } from '@/theme';
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
        <Ionicons name="logo-instagram" size={18} color={color.brand} />
        <Text variant="caption" className="ml-2 font-semibold text-brand">
          @samona.in
        </Text>
      </Pressable>
    </View>
  );
}

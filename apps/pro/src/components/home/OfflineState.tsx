import { useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';

/** The sheet's collapsed height plus breathing room, so the GIF never hides. */
const SHEET_CLEARANCE = 188;

/**
 * The off-duty home surface. It deliberately reuses the existing
 * `samona_pro_go_online.gif` (the same asset the pro already knows) as a quiet
 * prompt toward the header switch — no invented jobs, demand zones or surge.
 */
export function OfflineState() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const size = Math.min(200, Math.max(150, width * 0.5));

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ paddingBottom: SHEET_CLEARANCE }}
    >
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves this bundled GIF.
        source={require('../../../assets/images/animations/samona_pro_go_online.gif')}
        style={{ width: size, height: size }}
        contentFit="contain"
        autoplay
        accessibilityLabel={t('dashboard.offline.title')}
      />
      <Text variant="title" className="mt-4 text-center">
        {t('dashboard.offline.title')}
      </Text>
      <Text variant="body" className="mt-2 max-w-[280px] text-center text-text-secondary">
        {t('dashboard.offline.subtitle')}
      </Text>
    </View>
  );
}

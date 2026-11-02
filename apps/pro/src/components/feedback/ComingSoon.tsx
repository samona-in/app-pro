import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen, Text } from '@/components/ui';
import { color } from '@/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ComingSoonProps {
  /** Icon reflecting the feature the Pro tapped, so the placeholder lands in context. */
  icon: IoniconName;
  /** Feature-specific copy explaining what is on the way. */
  description: string;
  /** Extra root-screen classes; screens pass `bg-surface` for a white page. */
  className?: string;
}

/**
 * Shared placeholder for Pro features that are not built yet. Renders the
 * feature illustration, a common "Coming Soon" heading and the caller's
 * description — so a future feature wires up in one screen without duplicating
 * this layout.
 */
export function ComingSoon({ icon, description, className }: ComingSoonProps) {
  const { t } = useTranslation();

  return (
    <Screen edges={['top']} className={className}>
      <View className="flex-1 items-center justify-center px-6">
        <View className="mb-6 h-24 w-24 items-center justify-center rounded-full bg-brand-soft">
          <Ionicons name={icon} size={44} color={color.brand} />
        </View>

        <Text variant="titleLg" className="text-center">
          {t('comingSoon.title')}
        </Text>
        <Text variant="body" className="mt-2 max-w-[300px] text-center text-text-secondary">
          {description}
        </Text>
      </View>
    </Screen>
  );
}

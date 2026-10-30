import { memo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Wordmark } from '@/components/brand/Wordmark';
import { IconButton, Text } from '@/components/ui';
import { useNotificationsUnread } from '@/hooks/use-notifications-unread';
import { AvailabilityToggle } from './AvailabilityToggle';

export interface HomeHeaderProps {
  isOnline: boolean;
  isTransitioning: boolean;
  onToggle: () => void;
}

/** SAMONA Pro wordmark, the on/off-duty switch, the job pool and the bell. */
export const HomeHeader = memo(function HomeHeader({
  isOnline,
  isTransitioning,
  onToggle,
}: HomeHeaderProps) {
  const { t } = useTranslation();
  const unread = useNotificationsUnread();

  return (
    <View className="h-14 flex-row items-center px-3.5">
      <View className="flex-1 flex-row items-center">
        <Wordmark size="sm" compact />
      </View>

      <AvailabilityToggle
        isOnline={isOnline}
        isTransitioning={isTransitioning}
        onToggle={onToggle}
      />

      <View className="flex-1 flex-row items-center justify-end">
        <IconButton
          name="briefcase-outline"
          accessibilityLabel={t('routes.jobPool')}
          onPress={() => router.push('/jobs')}
        />
        <View>
          <IconButton
            name="notifications-outline"
            accessibilityLabel={t('dashboard.header.notifications')}
            onPress={() => router.push('/notifications')}
          />
          {unread > 0 ? (
            <View
              pointerEvents="none"
              className="absolute right-1 top-1 min-w-[18px] items-center justify-center rounded-full border border-surface bg-danger px-1"
            >
              <Text className="text-[10px] font-bold leading-4 text-text-inverse">
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ServiceOption } from '@samona/types';
import { ErrorState, LoadingState } from '@/components/feedback';
import { HomeHeader, SearchBar, ServiceGrid } from '@/components/home';
import { Screen, IconButton } from '@/components/ui';
import { useServiceCategories, useSession } from '@/hooks';

export default function Home() {
  const { customerProfile } = useSession();
  const categories = useServiceCategories();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  function handleSelectService(service: ServiceOption) {
    setActiveSlug(service.slug);
    router.push('/bookings');
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <StatusBar style="dark" />
      <HomeHeader
        locationLabel={customerProfile?.locationLabel ?? undefined}
        onPress={() => router.push('/location-picker')}
        trailing={
          <IconButton
            name="notifications-outline"
            accessibilityLabel="Notifications"
            onPress={() => router.push('/notifications')}
          />
        }
      >
        <SearchBar onPress={() => router.push('/bookings')} />
      </HomeHeader>

      <View className="mt-5">
        {categories.isPending ? (
          <LoadingState message="Loading services" size="inline" />
        ) : categories.isError ? (
          <ErrorState
            title="Couldn't load services"
            message="Check your connection and try again."
            onRetry={() => void categories.refetch()}
          />
        ) : (
          <ServiceGrid
            services={categories.data ?? []}
            activeSlug={activeSlug ?? undefined}
            onSelect={handleSelectService}
          />
        )}
      </View>
    </Screen>
  );
}

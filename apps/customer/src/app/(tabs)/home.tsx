import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { ServiceOption } from '@samona/types';
import { ErrorState, LoadingState } from '@/components/feedback';
import { HomeHeader, PromoBanner, SearchBar, ServiceGrid } from '@/components/home';
import { Screen, Text } from '@/components/ui';
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
    <Screen scrollable>
      <HomeHeader locationLabel={customerProfile?.locationLabel ?? undefined} />

      <View className="mt-5">
        <SearchBar onPress={() => router.push('/bookings')} />
      </View>

      <View className="mt-5">
        <PromoBanner onPress={() => router.push('/bookings')} />
      </View>

      <Text variant="title" className="mt-7">
        Categories
      </Text>

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

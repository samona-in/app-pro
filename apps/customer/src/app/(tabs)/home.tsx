import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import type { ServiceOption } from '@samona/types';
import { ErrorState, LoadingState } from '@/components/feedback';
import { HomeHeader, SearchBar, ServiceGrid } from '@/components/home';
import { isImageUrl } from '@/components/home/ServiceImage';
import { NotificationBell } from '@/components/notifications';
import { Screen } from '@/components/ui';
import { useResolvedLocationLabel, useServiceCategories, useSession } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';

import vijayawadaImage from '@/assets/images/vijayawada1.png';

export default function Home() {
  const { customerProfile } = useSession();
  const locationLabel = useResolvedLocationLabel(customerProfile);
  const categories = useServiceCategories();
  const bookingDraft = useBookingDraft();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  // The tab stays mounted behind the booking flow, so a picked service would
  // still look selected when the customer navigates back. Clear it on focus.
  useFocusEffect(
    useCallback(() => {
      setActiveSlug(null);
    }, []),
  );

  // Keep the catalogue icons warm in expo-image's shared memory+disk cache.
  // A tile that re-mounts while the home tab re-attaches behind the booking
  // flow renders instantly from cache instead of flashing a blank tile.
  useEffect(() => {
    const urls = (categories.data ?? [])
      .map((service) => service.icon)
      .filter((icon): icon is string => isImageUrl(icon));
    if (urls.length > 0) void Image.prefetch(urls);
  }, [categories.data]);

  function handleSelectService(service: ServiceOption) {
    setActiveSlug(service.slug);
    bookingDraft.start(service);
    router.push(`/booking/new/${service.slug}/place`);
  }

  return (
    <Screen scrollable edges={[]}>
      <StatusBar style="dark" />
      <HomeHeader
        locationLabel={locationLabel ?? undefined}
        onPress={() => router.push('/address-search')}
        trailing={<NotificationBell />}
      >
        <SearchBar onPress={() => router.push('/search')} />
      </HomeHeader>

      <View className="mt-5 flex-1">
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

      <Image
        source={vijayawadaImage}
        contentFit="cover"
        accessibilityLabel="Vijayawada"
        style={{
          width: '100%',
          aspectRatio: 1.5,
        }}
      />
    </Screen>
  );
}

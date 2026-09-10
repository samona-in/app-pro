import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import type { ServiceOption } from '@samona/types';
import { ErrorState, LoadingState } from '@/components/feedback';
import { HomeHeader, SearchBar, ServiceGrid } from '@/components/home';
import { isImageUrl } from '@/components/home/ServiceImage';
import { NotificationBell } from '@/components/notifications';
import { Screen } from '@/components/ui';
import { useServiceCategories, useSession } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';

import vijayawadaImage from '@/assets/images/vijayawada1.png';

const BANNER_ASPECT_RATIO = 2.5;

function FooterBanner() {
  return (
    <View style={{ width: '100%', paddingHorizontal: 20, paddingTop: 16 }}>
      <View
        className="overflow-hidden rounded-2xl"
        style={{ width: '100%', aspectRatio: BANNER_ASPECT_RATIO }}
      >
        <Image
          source={vijayawadaImage}
          contentFit="cover"
          accessibilityLabel="Vijayawada"
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    </View>
  );
}

export default function Home() {
  const { customerProfile } = useSession();
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

  // The banner is a normal in-flow row below the scroll area, so it stays
  // pinned to the bottom of the screen while the catalogue scrolls above it.
  return (
    <Screen edges={['bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <HomeHeader
          locationLabel={customerProfile?.locationLabel ?? undefined}
          onPress={() => router.push('/location-picker')}
          trailing={<NotificationBell />}
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
      </ScrollView>

      <FooterBanner />
    </Screen>
  );

  function handleSelectService(service: ServiceOption) {
    setActiveSlug(service.slug);
    bookingDraft.start(service);
    router.push(`/booking/new/${service.slug}/place`);
  }
}

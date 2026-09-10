import { useCallback, useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
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

export default function Home() {
  const { width } = useWindowDimensions();
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

  function handleSelectService(service: ServiceOption) {
    setActiveSlug(service.slug);
    bookingDraft.start(service);
    router.push(`/booking/new/${service.slug}/place`);
  }

  const contentWidth = width - 40;
  const bannerHeight = Math.round(contentWidth / BANNER_ASPECT_RATIO);

  return (
    <Screen
      scrollable
      edges={['bottom']}
      contentClassName="pb-[224]"
      footer={
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.9)',
            paddingTop: 8,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: -4 },
            elevation: 8,
          }}
        >
          <Image
            source={vijayawadaImage}
            contentFit="cover"
            accessibilityLabel="Vijayawada"
            style={{
              width: contentWidth,
              height: bannerHeight,
              borderRadius: 16,
            }}
          />
        </View>
      }
    >
      <StatusBar style="dark" />
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
    </Screen>
  );
}

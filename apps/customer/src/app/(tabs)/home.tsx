import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ServiceOption } from '@samona/types';
import { ErrorState, LoadingState } from '@/components/feedback';
import { HomeHeader, SearchBar, ServiceGrid } from '@/components/home';
import { NotificationBell } from '@/components/notifications';
import { Screen } from '@/components/ui';
import { useServiceCategories, useSession } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';

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

  function handleSelectService(service: ServiceOption) {
    setActiveSlug(service.slug);
    bookingDraft.start(service);
    router.push(`/booking/new/${service.slug}/place`);
  }

  return (
    <Screen scrollable edges={['bottom']}>
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

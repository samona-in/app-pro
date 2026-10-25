import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PopularSkill, ServiceOption } from '@samona/types';
import { ErrorState, LoadingState } from '@/components/feedback';
import {
  HOME_BANNERS,
  HomeBannerCarousel,
  HomeHeader,
  PopularSkills,
  SearchBar,
  ServiceGrid,
  type HomeBanner,
} from '@/components/home';
import { isImageUrl } from '@/components/home/ServiceImage';
import { NotificationBell } from '@/components/notifications';
import { Screen } from '@/components/ui';
import {
  useActiveSavedAddress,
  useBanners,
  usePopularSkills,
  useResolvedLocationLabel,
  useServiceCategories,
  useSession,
} from '@/hooks';
import { useBookingDraft } from '@/stores/booking';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { customerProfile } = useSession();
  const locationLabel = useResolvedLocationLabel(customerProfile);
  const activeSavedAddress = useActiveSavedAddress(customerProfile);
  const categories = useServiceCategories();
  const popular = usePopularSkills();
  const bannersQuery = useBanners();
  const bookingDraft = useBookingDraft();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    const urls = [
      ...(categories.data ?? []).map((service) => service.icon),
      ...(popular.data ?? []).map((skill) => skill.icon ?? skill.service.icon),
    ].filter((icon): icon is string => isImageUrl(icon));
    if (urls.length > 0) void Image.prefetch(urls);
  }, [categories.data, popular.data]);

  function handleSelectService(service: ServiceOption) {
    setActiveSlug(service.slug);
    bookingDraft.start(service);
    router.push(`/booking/new/${service.slug}/place`);
  }

  // A popular skill opens the same booking flow with that skill already
  // chosen, so the customer only has to say where the work is needed.
  function handleSelectPopularSkill(skill: PopularSkill) {
    const service: ServiceOption = {
      id: skill.service.id,
      slug: skill.service.slug,
      name: skill.service.name,
      icon: skill.service.icon,
    };

    bookingDraft.start(service);
    // draft.start resets the skill, so setSkill has to come after it.
    bookingDraft.setSkill(skill);
    router.push(`/booking/new/${skill.service.slug}/place`);
  }

  // A banner either promotes one service — and starts the booking flow for
  // it — or opens the search screen when it is a general promotion.
  function handlePressBanner(banner: HomeBanner) {
    const service = banner.serviceSlug
      ? (categories.data ?? []).find((item) => item.slug === banner.serviceSlug)
      : undefined;

    if (!service) {
      router.navigate('/search');
      return;
    }

    setActiveSlug(service.slug);
    bookingDraft.start(service);
    router.push(`/booking/new/${service.slug}/place`);
  }

  // Pull-to-refresh re-reads everything the home renders: the service
  // catalogue, the popular rail and the banners. The location label follows
  // the device, so it is not part of the refresh.
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([categories.refetch(), popular.refetch(), bannersQuery.refetch()]);
    } catch (error) {
      console.warn('[home] pull-to-refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="light" />

      {/* Reserve the status-bar area above the scroller and paint it brand
          blue. The sticky search bar then pins directly beneath it on both
          iOS and Android instead of scrolling under the system UI. */}
      <View style={{ height: insets.top }} className="bg-brand" />

      <Screen
        scrollable
        edges={[]}
        padded={false}
        stickyHeaderIndices={[1]}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      >
        <HomeHeader
          variant="blue"
          safeAreaTop={false}
          locationLabel={locationLabel ?? undefined}
          locationCaption={activeSavedAddress?.name ?? 'Your location'}
          onPress={() => router.push('/address-search')}
          trailing={<NotificationBell variant="white" />}
        />

        {/* The sticky search bar must be a direct child of the scroll
            container. The location row above and the banner below scroll
            underneath it while the search stays pinned. */}
        <View className="bg-brand px-2 pb-2 pt-2">
          <SearchBar onPress={() => router.navigate('/search')} />
        </View>

        <View className="bg-brand px-2 pb-3">
          <HomeBannerCarousel
            banners={bannersQuery.data?.length ? bannersQuery.data : HOME_BANNERS}
            onPressBanner={handlePressBanner}
            variant="light"
          />
        </View>

        <View className="mt-3 px-2">
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

        <PopularSkills
          skills={popular.data ?? []}
          onSelect={handleSelectPopularSkill}
          onSeeAll={() => router.navigate('/search')}
        />
      </Screen>
    </View>
  );
}

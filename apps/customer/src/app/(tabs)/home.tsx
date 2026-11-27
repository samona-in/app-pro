import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PopularSkill, ServiceOption } from '@samona/types';
import { ErrorState, LoadingState } from '@/components/feedback';
import {
  BrandBanner,
  CartButton,
  HOME_BANNERS,
  HomeBannerCarousel,
  HomeHeader,
  InstagramLink,
  PopularSkills,
  SearchBar,
  SectionHeader,
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
  useStartBooking,
} from '@/hooks';
import { FLOATING_TAB_BAR_CLEARANCE } from '@/constants';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { customerProfile } = useSession();
  const locationLabel = useResolvedLocationLabel(customerProfile);
  const activeSavedAddress = useActiveSavedAddress(customerProfile);
  const categories = useServiceCategories();
  const popular = usePopularSkills();
  const bannersQuery = useBanners();
  const startBooking = useStartBooking();
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
    startBooking(service);
  }

  // A popular skill opens the same booking flow with that work highlighted,
  // so the customer can add it (or another) from the catalogue.
  function handleSelectPopularSkill(skill: PopularSkill) {
    const service: ServiceOption = {
      id: skill.service.id,
      slug: skill.service.slug,
      name: skill.service.name,
      icon: skill.service.icon,
    };

    startBooking(service, { preselectedSkillId: skill.id });
  }

  // An IMAGE banner is an advert: its only action is the link admin provided.
  // A PROMO banner either starts the booking flow for its service or opens the
  // search screen when it is a general promotion.
  function handlePressBanner(banner: HomeBanner) {
    if (banner.type === 'IMAGE') {
      if (banner.linkUrl) {
        void Linking.openURL(banner.linkUrl).catch((error) => {
          console.warn('[home] could not open banner link:', error);
        });
      }
      return;
    }

    const service = banner.serviceSlug
      ? (categories.data ?? []).find((item) => item.slug === banner.serviceSlug)
      : undefined;

    if (!service) {
      router.navigate('/search');
      return;
    }

    setActiveSlug(service.slug);
    startBooking(service);
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
      <StatusBar style="dark" />

      {/* Reserve the status-bar area above the scroller and paint it white, so
          the sticky search bar pins beneath a clean top edge on both iOS and
          Android instead of running under the system UI. */}
      <View style={{ height: insets.top }} className="bg-surface" />

      <Screen
        scrollable
        edges={[]}
        padded={false}
        stickyHeaderIndices={[1]}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      >
        <HomeHeader
          safeAreaTop={false}
          locationLabel={locationLabel ?? undefined}
          locationCaption={activeSavedAddress?.name ?? 'Your location'}
          onPress={() => router.push('/address-search')}
          trailing={
            <View className="flex-row items-center gap-1">
              <CartButton />
              <NotificationBell />
            </View>
          }
        />

        {/* The sticky search bar must be a direct child of the scroll
            container. The header above and the banner below scroll underneath
            it while the search stays pinned. */}
        <View className="bg-surface px-4 pb-3 pt-1">
          <SearchBar onPress={() => router.navigate('/search')} />
        </View>

        <View className="mt-2">
          <HomeBannerCarousel
            banners={bannersQuery.data?.length ? bannersQuery.data : HOME_BANNERS}
            onPressBanner={handlePressBanner}
          />
        </View>

        <View className="mt-6 px-4">
          <SectionHeader
            title="Services"
            subtitle="Book trusted professionals for your home."
            actionLabel="See all"
            actionAccessibilityLabel="See all services"
            onPressAction={() => router.navigate('/search')}
            className="mb-4"
          />

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
          className="mt-6"
          skills={popular.data ?? []}
          onSelect={handleSelectPopularSkill}
          onSeeAll={() => router.navigate('/search')}
        />

        {/* Closing brand image and follow link, last before tab-bar clearance. */}
        <BrandBanner className="mt-6" />
        <InstagramLink className="mt-1" />

        {/* Keep the last rail scrollable clear of the floating tab pill. */}
        <View style={{ height: insets.bottom + FLOATING_TAB_BAR_CLEARANCE }} />
      </Screen>
    </View>
  );
}

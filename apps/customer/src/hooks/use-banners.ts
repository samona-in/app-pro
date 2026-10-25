import { useQuery } from '@tanstack/react-query';
import type { HomeBanner } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

const bannerImageMap: Record<string, any> = {
  'banner-1.png': require('@/assets/images/banners/banner-1.png'),
  'banner-2.png': require('@/assets/images/banners/banner-2.png'),
  'banner-3.png': require('@/assets/images/banners/banner-3.png'),
  'banner-4.png': require('@/assets/images/banners/banner-4.png'),
};

function resolveBannerImage(image: string) {
  if (image.startsWith('http')) {
    return { uri: image };
  }
  if (bannerImageMap[image]) {
    return bannerImageMap[image];
  }
  // Try basename
  const basename = image.split('/').pop();
  if (basename && bannerImageMap[basename]) {
    return bannerImageMap[basename];
  }
  // Fallback
  return bannerImageMap['banner-1.png'];
}

export function useBanners() {
  return useQuery({
    queryKey: queryKeys.banners,
    queryFn: async () => {
      const banners = await api.get<HomeBanner[]>('/banners');
      return banners.map((banner) => ({
        ...banner,
        image: resolveBannerImage(banner.image),
      }));
    },
    staleTime: 5 * 60_000,
  });
}

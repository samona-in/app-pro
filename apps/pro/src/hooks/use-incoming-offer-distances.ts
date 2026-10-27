import { useQueries } from '@tanstack/react-query';
import { distanceKm } from '@samona/config';
import type { AvailableJob } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';
import { useIncomingOffersStore, type PendingOffer } from '@/stores/incoming-offers';
import { useProLocationStore } from '@/stores/pro-location';

export interface IncomingOfferWithDistance extends PendingOffer {
  distanceStatus: 'loading' | 'ready' | 'unavailable';
}

/** Derived from both inputs, never frozen at arrival time or tied to selection. */
export function useIncomingOfferDistances(): IncomingOfferWithDistance[] {
  const offersById = useIncomingOffersStore((state) => state.offersById);
  const coordinates = useProLocationStore((state) => state.coordinates);
  const status = useProLocationStore((state) => state.status);
  const offers = Object.values(offersById);
  // Old native/push payloads contain a distance snapshot but no job point.
  // Read that point once through the existing authorized endpoint so those
  // cards can follow movement too. No polling, selection or store re-insertion.
  const details = useQueries({
    queries: offers.map((offer) => ({
      queryKey: queryKeys.jobs.detail(offer.jobId),
      queryFn: () => api.get<AvailableJob>(`/jobs/${offer.jobId}`),
      enabled: offer.coordinates == null,
      staleTime: Infinity,
      retry: false,
    })),
  });

  return offers.map((offer, index) => {
    const detail = details[index];
    const job = detail?.data;
    const point =
      offer.coordinates ??
      (job?.latitude != null && job.longitude != null
        ? { latitude: job.latitude, longitude: job.longitude }
        : null);
    if (status === 'unavailable') {
      return { ...offer, distanceMeters: null, distanceStatus: 'unavailable' };
    }
    if (coordinates && point) {
      const meters = Math.round(distanceKm(coordinates, point) * 1000);
      if (Number.isFinite(meters) && meters >= 0) {
        return { ...offer, distanceMeters: meters, distanceStatus: 'ready' };
      }
      return { ...offer, distanceMeters: null, distanceStatus: 'unavailable' };
    }
    if (!point && (detail?.isError || detail?.isSuccess)) {
      return { ...offer, distanceMeters: null, distanceStatus: 'unavailable' };
    }
    const loading = status === 'loading' || (!point && detail?.isPending);
    return { ...offer, distanceMeters: null, distanceStatus: loading ? 'loading' : 'unavailable' };
  });
}

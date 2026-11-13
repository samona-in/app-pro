import { useQueries } from '@tanstack/react-query';
import { distanceKm } from '@samona/config';
import type { AvailableJob } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';
import { useIncomingOffersStore, toOfferWorks, type PendingOffer } from '@/stores/incoming-offers';
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
  // Old native/push payloads contain a distance snapshot but no job point,
  // and pre-bulk payloads carry no works breakdown. Both are read once through
  // the existing authorized endpoint so those cards can follow movement and
  // render every work too. No polling, selection or store re-insertion.
  const details = useQueries({
    queries: offers.map((offer) => ({
      queryKey: queryKeys.jobs.detail(offer.jobId),
      queryFn: () => api.get<AvailableJob>(`/jobs/${offer.jobId}`),
      enabled: offer.coordinates == null || offer.works == null,
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
    const works = offer.works ?? (job ? toOfferWorks(job.items) : null);
    const orderType = offer.orderType ?? job?.orderType ?? null;
    if (status === 'unavailable') {
      return { ...offer, works, orderType, distanceMeters: null, distanceStatus: 'unavailable' };
    }
    if (coordinates && point) {
      const meters = Math.round(distanceKm(coordinates, point) * 1000);
      if (Number.isFinite(meters) && meters >= 0) {
        return { ...offer, works, orderType, distanceMeters: meters, distanceStatus: 'ready' };
      }
      return { ...offer, works, orderType, distanceMeters: null, distanceStatus: 'unavailable' };
    }
    if (!point && (detail?.isError || detail?.isSuccess)) {
      return { ...offer, works, orderType, distanceMeters: null, distanceStatus: 'unavailable' };
    }
    const loading = status === 'loading' || (!point && detail?.isPending);
    return {
      ...offer,
      works,
      orderType,
      distanceMeters: null,
      distanceStatus: loading ? 'loading' : 'unavailable',
    };
  });
}

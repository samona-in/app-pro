import { useCallback } from 'react';
import { router } from 'expo-router';
import type { ServiceOption } from '@samona/types';
import { useBookingDraft } from '@/stores/booking';

/**
 * Opens a service's catalogue.
 *
 * A cart may hold works from several services, so starting a booking never
 * discards what the customer already picked for another service. `start` only
 * switches which group the catalogue edits; the rest of the cart is untouched.
 */
export function useStartBooking() {
  const start = useBookingDraft((state) => state.start);

  return useCallback(
    (service: ServiceOption, options?: { preselectedSkillId?: string | null }) => {
      start(service, options?.preselectedSkillId ?? null);
      router.push(`/booking/new/${service.slug}/skill`);
    },
    [start],
  );
}

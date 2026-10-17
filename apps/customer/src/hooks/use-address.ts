import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressSuggestion, SavedAddress } from '@samona/types';
import type { SavedAddressCreateInput, SavedAddressUpdateInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { addressesApi } from '@/services/addresses';
import { geocodingApi } from '@/services/geocoding';
import { useAddressStore } from '@/stores/addresses';

/** Settles a fast-changing value (e.g. a search box) after `delay`ms of quiet. */
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Address suggestions for a free-text query, debounced client-side.
 *
 * Requests only start once the query is at least two characters and are
 * re-run as the debounced value settles; earlier results stay visible while a
 * newer search is in flight so the list does not flicker.
 */
export function useAddressSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query).trim();
  const enabled = debouncedQuery.length >= 2;

  return useQuery({
    queryKey: queryKeys.geocode.search(debouncedQuery),
    queryFn: () => geocodingApi.search(debouncedQuery),
    enabled,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/** The place that covers a coordinate, for the confirm screen's address line. */
export function useReverseGeocode(latitude: number | null, longitude: number | null) {
  const hasCoords = latitude !== null && longitude !== null;

  return useQuery({
    queryKey: queryKeys.geocode.reverse(latitude ?? 0, longitude ?? 0),
    queryFn: () => geocodingApi.reverse(latitude as number, longitude as number),
    enabled: hasCoords,
    staleTime: 60_000,
  });
}

/**
 * Re-resolves a stored place id into a fresh suggestion.
 *
 * Backs the "store the id, refresh the label on read" model: a saved address
 * keeps its place id and coordinates indefinitely, while the display text is
 * refreshed from this query when a screen reads it. React Query caches the
 * result for the session and the server caches it for 30 days, so a label is
 * never fetched per render and a Google call is never made twice in that window.
 */
export function useResolvedPlace(placeId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.geocode.place(placeId ?? ''),
    queryFn: () => geocodingApi.resolvePlace(placeId as string),
    enabled: Boolean(placeId),
    staleTime: 30 * 60_000,
    retry: 0,
  });
}

/**
 * The freshest display label for a profile's active location.
 *
 * Returns the stored label immediately and upgrades it to the re-resolved one
 * once (and if) the place id refreshes. Keeps the caller free of the loading
 * dance: the stored text is always a valid answer.
 */
export function useResolvedLocationLabel(
  profile: { locationLabel: string | null; locationPlaceId: string | null } | null | undefined,
): string | null {
  const { data } = useResolvedPlace(profile?.locationPlaceId);
  return data?.formattedAddress ?? profile?.locationLabel ?? null;
}

/** The caller's saved addresses, hydrated recents along the way. */
export function useSavedAddresses() {
  const hydrateRecents = useAddressStore((state) => state.hydrate);

  useEffect(() => {
    void hydrateRecents();
  }, [hydrateRecents]);

  return useQuery({
    queryKey: queryKeys.addresses.list,
    queryFn: () => addressesApi.list(),
    staleTime: 30_000,
  });
}

/** Saves a new labelled address. */
export function useCreateSavedAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SavedAddressCreateInput) => addressesApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list });
    },
  });
}

/** Edits one saved address, e.g. to make it the default. */
export function useUpdateSavedAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SavedAddressUpdateInput }) =>
      addressesApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list });
    },
  });
}

/** Deletes one saved address. */
export function useDeleteSavedAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => addressesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list });
    },
  });
}

export type { AddressSuggestion, SavedAddress };
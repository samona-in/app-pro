import type { AddressLabel, AddressSuggestion, SelectedAddress } from '@samona/types';

/** Human display names for `AddressLabel`. */
export const ADDRESS_LABEL_NAMES: Record<AddressLabel, string> = {
  HOME: 'Home',
  WORK: 'Work',
  OTHER: 'Other',
};

/** A short, always-filled location line for when geocoding yields nothing. */
export function fallbackLocationLabel(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** Area line shown beneath a saved address's primary line. */
export function savedAddressSecondary(address: {
  addressLine2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string | null {
  const area = [address.addressLine2, address.landmark, address.locality, address.city].filter(
    (part): part is string => Boolean(part),
  );
  if (area.length > 0) return area.join(', ');
  return [address.state, address.postalCode].filter((part): part is string => Boolean(part)).join(', ') || null;
}

/** Narrows a geocoder result down to the active-location shape stored on a profile. */
export function suggestionToSelected(suggestion: AddressSuggestion): SelectedAddress {
  return {
    formattedAddress: suggestion.formattedAddress,
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
    locality: suggestion.locality ?? null,
    city: suggestion.city ?? null,
    state: suggestion.state ?? null,
    postalCode: suggestion.postalCode ?? null,
  };
}

/** Widens a selected address back to the shape the confirm screen renders from. */
export function selectedToSuggestion(selected: SelectedAddress): AddressSuggestion {
  const secondary = [selected.locality, selected.city, selected.state, selected.postalCode]
    .filter((part): part is string => Boolean(part))
    .join(', ');
  return {
    formattedAddress: selected.formattedAddress,
    mainLabel: selected.formattedAddress.split(',')[0] ?? selected.formattedAddress,
    secondary: secondary || null,
    locality: selected.locality,
    city: selected.city,
    state: selected.state,
    postalCode: selected.postalCode,
    latitude: selected.latitude,
    longitude: selected.longitude,
  };
}
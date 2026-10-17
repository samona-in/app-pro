import type {
  AddressLabel,
  AddressSuggestion,
  SelectedAddress,
} from '@samona/types';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/** Human display names for `AddressLabel`. */
export const ADDRESS_LABEL_NAMES: Record<AddressLabel, string> = {
  HOME: 'Home',
  WORK: 'Work',
  OTHER: 'Other',
};

/** A short, always-filled location line for when geocoding yields nothing. */
export function fallbackLocationLabel(
  latitude: number,
  longitude: number,
): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** Secondary text shown in a saved address row. */
export function savedAddressSecondary(address: {
  addressLine2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string | null {
  const area = [
    address.addressLine2,
    address.landmark,
    address.locality,
    address.city,
  ].filter((part): part is string => Boolean(part));

  if (area.length > 0) {
    return area.join(', ');
  }

  const fallback = [address.state, address.postalCode]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return fallback || null;
}

/**
 * Coordinates a saved address is anchored to.
 */
export function savedAddressCoordinates(address: {
  latitude: number;
  longitude: number;
}): Coordinates {
  return {
    latitude: address.latitude,
    longitude: address.longitude,
  };
}

/**
 * Converts a saved address into an AddressSuggestion.
 * Used when opening/editing an existing saved address.
 */
export function savedAddressToSuggestion(address: {
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  placeId: string | null;
}): AddressSuggestion {
  return {
    formattedAddress: address.addressLine1,
    mainLabel:
      address.addressLine1.split(',')[0]?.trim() || address.addressLine1,
    secondary: savedAddressSecondary(address),
    locality: address.locality,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    latitude: address.latitude,
    longitude: address.longitude,
    placeId: address.placeId,
  };
}

/**
 * Converts a geocoder suggestion into the active-location shape
 * stored on the customer's profile.
 */
export function suggestionToSelected(
  suggestion: AddressSuggestion,
): SelectedAddress {
  return {
    formattedAddress: suggestion.formattedAddress,
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
    locality: suggestion.locality ?? null,
    city: suggestion.city ?? null,
    state: suggestion.state ?? null,
    postalCode: suggestion.postalCode ?? null,
    placeId: suggestion.placeId ?? null,
  };
}

/**
 * Converts the customer's selected active address back into
 * the suggestion shape used by the address screens.
 */
export function selectedToSuggestion(
  selected: SelectedAddress,
): AddressSuggestion {
  const secondary = [
    selected.locality,
    selected.city,
    selected.state,
    selected.postalCode,
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return {
    formattedAddress: selected.formattedAddress,
    mainLabel:
      selected.formattedAddress.split(',')[0]?.trim() ||
      selected.formattedAddress,
    secondary: secondary || null,
    locality: selected.locality,
    city: selected.city,
    state: selected.state,
    postalCode: selected.postalCode,
    latitude: selected.latitude,
    longitude: selected.longitude,
    placeId: selected.placeId ?? null,
  };
}
/**
 * Address types shared by the Customer app and the API.
 *
 * Three distinct shapes live here: what OSM geocoding returns (`AddressSuggestion`),
 * what a customer permanently saves (`SavedAddress`), and the lightweight object that
 * becomes the active location on a customer profile (`SelectedAddress`).
 */

/** Where a saved address points to — Home, Work or Other. Mirrors the Prisma enum. */
export const AddressLabel = {
  HOME: 'HOME',
  WORK: 'WORK',
  OTHER: 'OTHER',
} as const;

export type AddressLabel = (typeof AddressLabel)[keyof typeof AddressLabel];

export const ADDRESS_LABELS = Object.values(AddressLabel);

/**
 * A structured place from the geocoding proxy, provider-agnostic (Photon,
 * Pelias, Nominatim, ...). The client renders `mainLabel` as the primary line
 * and `secondary` beneath it.
 */
export interface AddressSuggestion {
  /** Full, display-ready address ("Benz Circle, Moghalrajapuram, Vijayawada 520010"). */
  formattedAddress: string;
  /** The primary place name ("Benz Circle") — the top line of a result row. */
  mainLabel: string;
  /** The area line beneath the primary name; null when there is nothing else. */
  secondary: string | null;
  /** District / sub-locality when the provider knows one. */
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
}

/** A saved address owned by a customer (name + label + details + coordinates). */
export interface SavedAddress {
  id: string;
  /** The customer's own name for this address (shown as the row's primary line). */
  name: string;
  label: AddressLabel;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  /** At most one default per customer; true for exactly the primary address. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The active location a customer books from, stored on the customer profile so
 * job matching has coordinates even before the first job request is raised.
 * Updated instantly when the customer picks an address.
 */
export interface SelectedAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}
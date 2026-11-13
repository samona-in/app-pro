import type { BookingCart } from '@samona/types';
import type { SaveBookingCartRequest } from '@samona/validation';
import { api } from './api';

/**
 * Typed requests for the customer's saved booking cart, mounted at `/drafts`.
 *
 * The server owns the durable copy: the app hydrates from it on launch and
 * writes the local working copy back as the customer edits. A cart may span
 * several services, one saved group per service. Prices never travel in either
 * direction — the server re-estimates every save from the catalogue and freezes
 * the final amount only when the booking is placed.
 */
export const draftsApi = {
  /** The caller's current cart, or null when nothing is in progress. */
  getCurrent: () => api.get<BookingCart | null>('/drafts/current'),

  /**
   * Saves (or replaces) the cart. An empty `groups` list clears it and
   * resolves to null.
   */
  save: (input: SaveBookingCartRequest) => api.put<BookingCart | null>('/drafts/current', input),
  /** Abandons the cart. Idempotent. */
  clear: () => api.delete<{ success: true }>('/drafts/current'),
};

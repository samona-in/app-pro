import type { CustomerProfile } from '@samona/types';
import type { CustomerLocationPatchInput } from '@samona/validation';
import { api } from './api';

/**
 * The customer's own profile.
 *
 * A thin wrapper over the shared API client — the server owns the profile and
 * every rule about what may change on it (CLAUDE.md "API").
 */
export const customersApi = {
  /** Records where the customer is right now. */
  updateLocation: (input: CustomerLocationPatchInput) =>
    api.patch<CustomerProfile>('/customers/me/location', input),
};

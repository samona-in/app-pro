import type { SavedAddress } from '@samona/types';
import type { SavedAddressCreateInput, SavedAddressUpdateInput } from '@samona/validation';
import { api } from './api';

/**
 * CRUD for the caller's saved addresses (`/addresses`).
 *
 * The server scopes every request to the authenticated customer, so there is
 * nothing for the app to pass beyond the address itself.
 */
export const addressesApi = {
  async list(): Promise<SavedAddress[]> {
    const { data } = await api.get<{ data: SavedAddress[] }>('/addresses');
    return data;
  },

  async create(input: SavedAddressCreateInput): Promise<SavedAddress> {
    return api.post<SavedAddress>('/addresses', input);
  },

  async update(id: string, input: SavedAddressUpdateInput): Promise<SavedAddress> {
    return api.patch<SavedAddress>(`/addresses/${id}`, input);
  },

  async remove(id: string): Promise<void> {
    await api.delete<void>(`/addresses/${id}`);
  },
};
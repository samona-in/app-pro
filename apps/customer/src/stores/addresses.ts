import { create } from 'zustand';
import type { SelectedAddress } from '@samona/types';
import { secureStorage } from '@/services/secure-storage';

const RECENTS_KEY = 'address.recents.v1';
const RECENTS_MAX = 5;

/** Stable key for a coordinate: 5 decimals ≈ ~1 m, plenty to dedupe city pins. */
function recentKey(address: SelectedAddress): string {
  return `${address.latitude.toFixed(5)},${address.longitude.toFixed(5)}`;
}

function isSelectedAddress(value: unknown): value is SelectedAddress {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.formattedAddress === 'string' &&
    Number.isFinite(record.latitude) &&
    Number.isFinite(record.longitude)
  );
}

interface AddressState {
  /** Recently confirmed addresses, newest first. On-device only. */
  recents: SelectedAddress[];
  /** Whether `recents` has been loaded from SecureStore once. */
  hydrated: boolean;
  /** The address awaiting confirmation on the confirm screen. */
  pending: SelectedAddress | null;

  hydrate: () => Promise<void>;
  setPending: (address: SelectedAddress | null) => void;
  /** Records a confirmed address and persists the list. */
  addRecent: (address: SelectedAddress) => void;
}

/**
 * Client-only address UI state (CLAUDE.md "React Native Architecture").
 *
 * Recents live on the device because they are per-user preferences, not domain
 * state — the server's saved addresses stay in TanStack Query. The pending
 * selection is a transient handoff between the search and confirm screens, so
 * no address data has to travel through route params.
 */
export const useAddressStore = create<AddressState>((set, get) => ({
  recents: [],
  hydrated: false,
  pending: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const raw = await secureStorage.getItem(RECENTS_KEY);
    let recents: SelectedAddress[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          recents = parsed.filter(isSelectedAddress);
        }
      } catch {
        recents = [];
      }
    }
    set({ recents, hydrated: true });
  },

  setPending: (address) => set({ pending: address }),

  addRecent: (address) => {
    const next = [address, ...get().recents.filter((r) => recentKey(r) !== recentKey(address))]
      .slice(0, RECENTS_MAX);
    set({ recents: next, pending: null });
    void secureStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  },
}));
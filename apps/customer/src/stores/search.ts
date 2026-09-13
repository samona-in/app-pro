import { create } from 'zustand';
import type { ServiceOption, SkillWithService } from '@samona/types';
import { secureStorage } from '@/services/secure-storage';

const RECENTS_KEY = 'search.recents.v1';
const RECENTS_MAX = 8;

export type RecentSearchItem =
  | { type: 'service'; service: ServiceOption }
  | { type: 'skill'; skill: SkillWithService };

function itemId(item: RecentSearchItem): string {
  return item.type === 'service' ? `service:${item.service.id}` : `skill:${item.skill.id}`;
}

function isRecentSearchItem(value: unknown): value is RecentSearchItem {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r['type'] === 'service') {
    const s = r['service'];
    return typeof s === 'object' && s !== null && typeof (s as Record<string, unknown>)['id'] === 'string';
  }
  if (r['type'] === 'skill') {
    const s = r['skill'];
    return typeof s === 'object' && s !== null && typeof (s as Record<string, unknown>)['id'] === 'string';
  }
  return false;
}

interface SearchState {
  recents: RecentSearchItem[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addRecent: (item: RecentSearchItem) => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  recents: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const raw = await secureStorage.getItem(RECENTS_KEY);
    let recents: RecentSearchItem[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) recents = parsed.filter(isRecentSearchItem);
      } catch {
        recents = [];
      }
    }
    set({ recents, hydrated: true });
  },

  addRecent: (item) => {
    const id = itemId(item);
    const next = [item, ...get().recents.filter((r) => itemId(r) !== id)].slice(0, RECENTS_MAX);
    set({ recents: next });
    void secureStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  },
}));

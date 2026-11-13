import { create } from 'zustand';
import {
  JOB_ITEMS_LIMIT,
  ORDER_GROUP_SERVICES_LIMIT,
  OTHER_SKILL_SLUG,
  type BookingCart,
  type ServiceOption,
  type SkillOption,
} from '@samona/types';
import { clampQuantity, estimatedTotalPaise } from '@/utils/pricing';

/**
 * A reference photo attached to a booking cart.
 *
 * The `uri` is the local preview the user picked; `path` is the server-owned
 * object path returned once the bytes have reached storage. A cart whose
 * images have no `path` is not ready to submit.
 */
export interface DraftImage {
  uri: string;
  path: string | null;
  uploading: boolean;
  failed: boolean;
}

/**
 * One distinct work in the in-progress booking cart.
 *
 * Works are keyed by `skill.id`: adding a work that is already in the cart
 * replaces its entry (the customer picks the quantity in the details sheet),
 * mirroring the server's "each work appears once, adjust its quantity" rule.
 * The totals here are estimates only — the server re-prices every item from
 * the catalogue when the request is placed.
 */
export interface DraftItem {
  skill: SkillOption;
  /** Free-text category when `skill.slug` is the `other` sentinel. */
  customSkill: string;
  /** Work units for `PER_UNIT` skills; always 1 for the other models. */
  quantity: number;
  /** Booked duration for `PER_HOUR` skills; null otherwise. */
  durationMinutes: number | null;
  /** This work's estimated total, in paise (display only). */
  totalPaise: number;
}

/**
 * One service's slice of the cart.
 *
 * A checkout creates one job per service, so works are grouped by service and
 * each group keeps its own estimate. The cart may hold up to
 * {@link ORDER_GROUP_SERVICES_LIMIT} services and {@link JOB_ITEMS_LIMIT} works
 * per service.
 */
export interface DraftGroup {
  service: ServiceOption;
  items: DraftItem[];
}

interface BookingDraftState {
  /**
   * The service whose catalogue is open. The cart itself may hold other
   * services too; this only tells the catalogue which group to edit.
   */
  service: ServiceOption | null;
  /** The whole cart, one group per service. */
  groups: DraftGroup[];
  /**
   * Notes shared by the whole visit. One checkout is one visit, so the
   * description and reference photos belong to the cart, not to a work.
   */
  description: string;
  images: DraftImage[];
  /**
   * A work highlighted on arrival at the catalogue — a popular-work or search
   * result pick. Highlight only; the cart is what carries a selection.
   */
  preselectedSkillId: string | null;

  /**
   * Opens a service's catalogue without touching the rest of the cart. A
   * service already in the cart keeps its works; a new one starts empty.
   */
  start: (service: ServiceOption, preselectedSkillId?: string | null) => void;
  /**
   * Restores a cart saved on the server (app launch, device switch). Local
   * state is the working copy; the server copy is the durable one.
   */
  hydrate: (cart: BookingCart) => void;
  /**
   * Adds a work to the current service's group, or replaces its entry when it
   * is already there. Returns false (and leaves the cart untouched) when the
   * service's works are full or the cart already holds the maximum services.
   */
  addItem: (item: DraftItem) => boolean;
  /** Removes one work from the cart, dropping its service when it empties. */
  removeItem: (skillId: string) => void;
  /** Changes a `PER_UNIT` work's quantity, re-estimating its total. */
  setQuantity: (skillId: string, quantity: number) => void;
  /** Changes a `PER_HOUR` work's duration, re-estimating its total. */
  setDurationMinutes: (skillId: string, durationMinutes: number) => void;
  /** Removes a whole service from the cart. */
  clearService: (serviceId: string) => void;
  /**
   * Removes several services at once — used after a checkout that only covered
   * part of the cart, so the services left behind stay bookable.
   */
  removeServices: (serviceIds: readonly string[]) => void;
  setDescription: (description: string) => void;
  setImages: (images: DraftImage[] | ((prev: DraftImage[]) => DraftImage[])) => void;
  reset: () => void;
}

const blank: Pick<
  BookingDraftState,
  'description' | 'images' | 'groups' | 'preselectedSkillId'
> = {
  description: '',
  images: [],
  groups: [],
  preselectedSkillId: null,
};

/** Maps the server's saved groups into the local working copy. */
function groupsFromCart(cart: BookingCart): DraftGroup[] {
  return cart.groups.map((group) => ({
    service: group.service,
    items: group.items.map((item) => ({
      skill: item.skill,
      customSkill: item.customSkill ?? '',
      quantity: item.quantity,
      durationMinutes: item.durationMinutes,
      totalPaise: item.subtotalPaise,
    })),
  }));
}

/** The works of one service in the cart. */
export function groupItems(
  groups: readonly DraftGroup[],
  serviceId: string | null | undefined,
): DraftItem[] {
  if (!serviceId) return [];
  return groups.find((group) => group.service.id === serviceId)?.items ?? [];
}

/** Every work in the cart, across services. */
export function cartItems(groups: readonly DraftGroup[]): DraftItem[] {
  return groups.flatMap((group) => group.items);
}

/** How many services with at least one work the cart holds. */
export function cartServiceCount(groups: readonly DraftGroup[]): number {
  return groups.filter((group) => group.items.length > 0).length;
}

/** The whole cart's estimated total, in paise. */
export function cartTotalPaise(groups: readonly DraftGroup[]): number {
  return groups.reduce((sum, group) => sum + draftTotalPaise(group.items), 0);
}

/** How many distinct works the whole cart holds. */
export function cartWorksCount(groups: readonly DraftGroup[]): number {
  return groups.reduce((count, group) => count + group.items.length, 0);
}

/** How many work units the whole cart holds (`PER_UNIT` quantities; 1 otherwise). */
export function cartUnitCount(groups: readonly DraftGroup[]): number {
  return groups.reduce((count, group) => count + draftUnitCount(group.items), 0);
}

/**
 * The in-progress booking request, shared across the booking flow screens.
 *
 * Local state is the working copy the screens render; the server keeps a
 * durable copy (see `draft-sync`) so a cart survives an app kill or a device
 * switch. Placing the request (server state) is handled by TanStack Query,
 * never duplicated here (CLAUDE.md "React Native Architecture").
 */
export const useBookingDraft = create<BookingDraftState>((set, get) => ({
  service: null,
  ...blank,

  start: (service, preselectedSkillId = null) =>
    set({ service, preselectedSkillId }),

  hydrate: (cart) =>
    set({
      service: cart.groups[0]?.service ?? null,
      groups: groupsFromCart(cart),
      description: cart.description,
      images: cart.imagePaths.map((path, index) => ({
        // Public URL for display; the path is what a booking submits.
        uri: cart.imageUrls[index] ?? path,
        path,
        uploading: false,
        failed: false,
      })),
      preselectedSkillId: null,
    }),

  addItem: (item) => {
    const { groups, service } = get();
    if (!service) return false;

    const group = groups.find((entry) => entry.service.id === service.id);
    const items = group?.items ?? [];
    const isKnown = items.some((entry) => entry.skill.id === item.skill.id);
    if (!isKnown && items.length >= JOB_ITEMS_LIMIT) return false;
    if (!group && groups.length >= ORDER_GROUP_SERVICES_LIMIT) return false;

    set((state) => {
      const existing = state.groups.find((entry) => entry.service.id === service.id);
      if (!existing) {
        return { groups: [...state.groups, { service, items: [item] }] };
      }

      const index = existing.items.findIndex((entry) => entry.skill.id === item.skill.id);
      const next = [...existing.items];
      if (index === -1) next.push(item);
      else next[index] = item;

      return {
        groups: state.groups.map((entry) =>
          entry.service.id === service.id ? { ...entry, items: next } : entry,
        ),
      };
    });
    return true;
  },

  removeItem: (skillId) =>
    set((state) => ({
      groups: state.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((entry) => entry.skill.id !== skillId),
        }))
        // A service with no works is no longer part of the cart.
        .filter((group) => group.items.length > 0),
    })),

  setQuantity: (skillId, quantity) =>
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        items: group.items.map((entry) => {
          if (entry.skill.id !== skillId) return entry;
          const next = clampQuantity(entry.skill, quantity);
          return {
            ...entry,
            quantity: next,
            totalPaise: estimatedTotalPaise(entry.skill, next, entry.durationMinutes),
          };
        }),
      })),
    })),

  setDurationMinutes: (skillId, durationMinutes) =>
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        items: group.items.map((entry) => {
          if (entry.skill.id !== skillId) return entry;
          return {
            ...entry,
            durationMinutes,
            totalPaise: estimatedTotalPaise(entry.skill, entry.quantity, durationMinutes),
          };
        }),
      })),
    })),

  clearService: (serviceId) =>
    set((state) => ({
      groups: state.groups.filter((group) => group.service.id !== serviceId),
      service: state.service?.id === serviceId ? null : state.service,
    })),

  removeServices: (serviceIds) =>
    set((state) => {
      const removed = new Set(serviceIds);
      const groups = state.groups.filter((group) => !removed.has(group.service.id));
      return {
        groups,
        // The catalogue may have been editing one of the checked-out services;
        // point it at whatever is left instead of a group that no longer exists.
        service:
          state.service && removed.has(state.service.id)
            ? (groups[0]?.service ?? null)
            : state.service,
      };
    }),

  setDescription: (description) => set({ description }),

  setImages: (imagesOrUpdater) =>
    set((state) => ({
      images:
        typeof imagesOrUpdater === 'function'
          ? (imagesOrUpdater as (prev: DraftImage[]) => DraftImage[])(state.images)
          : imagesOrUpdater,
    })),

  reset: () => set({ service: null, ...blank }),
}));

/** The name a cart work reads as — its custom text when it is "Other". */
export function draftItemName(item: DraftItem): string {
  const custom = item.customSkill.trim();
  return item.skill.slug === OTHER_SKILL_SLUG && custom ? custom : item.skill.name;
}

/** One service group's estimated total, in paise. */
export function draftTotalPaise(items: readonly DraftItem[]): number {
  return items.reduce((sum, item) => sum + item.totalPaise, 0);
}

/** How many work units one group holds (`PER_UNIT` quantities; 1 otherwise). */
export function draftUnitCount(items: readonly DraftItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

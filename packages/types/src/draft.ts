import type { PricingModel, ServiceOption } from './pro';

/**
 * Lifecycle of a saved booking cart ("draft").
 *
 * - ACTIVE: the customer's current cart, restored on the next app launch.
 * - CONVERTED: the cart became a placed booking; `convertedJobId` points at it.
 * - ABANDONED: the customer cleared or replaced the cart without booking it.
 *
 * A customer has at most one ACTIVE draft. Converted and abandoned rows are
 * kept as history so support can see what people were building when they
 * dropped off, and so the catalogue team can see which services attract the
 * most draft activity.
 */
export const BOOKING_DRAFT_STATUSES = ['ACTIVE', 'CONVERTED', 'ABANDONED'] as const;

export type BookingDraftStatus = (typeof BOOKING_DRAFT_STATUSES)[number];

/**
 * A work as it was saved in a draft, with the catalogue configuration needed
 * to re-open the quantity/duration steppers without another catalogue read.
 */
export interface BookingDraftSkill {
  id: string;
  serviceId: string;
  slug: string;
  name: string;
  icon: string | null;
  /** Current catalogue price, in paise. Its meaning follows `pricingModel`. */
  basePricePaise: number | null;
  pricingModel: PricingModel;
  unitLabel: string | null;
  minQuantity: number;
  maxQuantity: number;
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  durationStepMinutes: number | null;
}

/** One distinct work in a saved cart, priced at save time. */
export interface BookingDraftItem {
  id: string;
  sortOrder: number;
  skill: BookingDraftSkill;
  /** Free-text category when `skill.slug` is the `other` sentinel. */
  customSkill: string | null;
  pricingModel: PricingModel;
  unitPricePaise: number;
  quantity: number;
  unitLabel: string | null;
  durationMinutes: number | null;
  subtotalPaise: number;
}

/**
 * A customer's server-side booking cart.
 *
 * `imagePaths` are the server-owned storage paths (submitted back on booking);
 * `imageUrls` are their public, display-ready forms. Both are derived from the
 * same upload, so the app never has to know the bucket.
 */
export interface BookingDraft {
  id: string;
  status: BookingDraftStatus;
  service: ServiceOption;
  description: string;
  imagePaths: string[];
  imageUrls: string[];
  /** Server-calculated estimate for the whole cart, in paise. */
  estimatedTotalPaise: number;
  items: BookingDraftItem[];
  /** Set once the draft has been converted into a booking. */
  convertedJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One service's slice of a multi-service cart.
 *
 * Each group maps to its own ACTIVE draft row (and, on checkout, its own job).
 * The service is embedded so the cart can render without another catalogue
 * read; every price is the server's estimate at save time.
 */
export interface BookingCartGroup {
  /** The ACTIVE draft row backing this service's slice. */
  id: string;
  service: ServiceOption;
  /** Server-calculated estimate for this service's works, in paise. */
  estimatedTotalPaise: number;
  items: BookingDraftItem[];
  updatedAt: string;
}

/**
 * A customer's whole cart: works from one or more services, saved together.
 *
 * Notes and reference photos are shared by the checkout (one visit, one
 * address). Each group becomes its own job, so each has its own estimate; the
 * cart's total is their sum. An empty cart is `null` from the API.
 */
export interface BookingCart {
  description: string;
  imagePaths: string[];
  imageUrls: string[];
  groups: BookingCartGroup[];
  /** Server-calculated estimate for the whole cart, in paise. */
  estimatedTotalPaise: number;
  /** Newest update among the groups; null when the cart is empty. */
  updatedAt: string | null;
}

/** One service's share of draft activity, for the admin analytics view. */
export interface BookingDraftServiceActivity {
  serviceId: string;
  serviceName: string;
  active: number;
  converted: number;
  abandoned: number;
  total: number;
}

/** A recent draft row in the admin analytics view. */
export interface AdminBookingDraftSummary {
  id: string;
  status: BookingDraftStatus;
  serviceName: string;
  customerName: string | null;
  worksCount: number;
  estimatedTotalPaise: number;
  updatedAt: string;
}

/** Aggregated draft activity returned to the admin app. */
export interface AdminBookingDraftOverview {
  generatedAt: string;
  totals: {
    active: number;
    converted: number;
    abandoned: number;
    total: number;
  };
  byService: BookingDraftServiceActivity[];
  recent: AdminBookingDraftSummary[];
}

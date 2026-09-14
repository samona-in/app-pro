import { create } from 'zustand';
import { JOB_DEFAULTS } from '@samona/config';
import type { AvailableJob } from '@samona/types';
import {
  clearNativeJobAlert,
  getPendingNativeJobs,
  type PendingNativeJob,
} from '@/services/overlay-alert';

/**
 * Live pending job offers for a free pro.
 *
 * A pro can be offered several jobs at once (the server pages every eligible
 * pro with no active job), and every offer is already persisted per-job in the
 * native AlertStore. This client-only store mirrors those offers in JS, keyed
 * by `jobId` (no FIFO, no fixed cap), feeds the combined incoming-jobs screen,
 * and is the single in-app collection for Accept/Decline. It is presentational
 * state only — the backend stays the source of truth, and every Accept is still
 * the atomic server-side claim.
 *
 * Feeders:
 *  - `rehydrateFromNative()` reads the persisted native offers back (the
 *    `getPendingNativeJobs()` flow, on app foreground / cold start);
 *  - `upsert()` is fed by the realtime `job:new`/`job:status` handlers and the
 *    foreground push fallback for non-native surfaces.
 *
 * `tick()` advances `now` once a second so countdowns re-render, and prunes
 * offers whose offer window (or job expiry) has passed — dropping them from
 * native storage too.
 */

export interface PendingOffer {
  jobId: string;
  /** Short heading, e.g. "Electrical job nearby". */
  title: string;
  /** Display name of the requested service. */
  serviceName: string;
  /** The requested category within the service; null when not known. */
  serviceCategory: string | null;
  /** Display label of the work location; null when unknown. */
  address: string | null;
  /** Straight-line distance from the pro, in metres; null when unknown. */
  distanceMeters: number | null;
  /** Guaranteed amount, in paise. */
  amountPaise: number | null;
  /** Job-level expiry (ISO); never the offer countdown. */
  expiresAt: string | null;
  /** When this offer stops being actionable (ISO) — the one countdown deadline. */
  offerExpiresAt: string | null;
  /** The signed offer token for this device; null without one. */
  jobOfferToken: string | null;
  /** When the offer first reached this pro (epoch ms). */
  receivedAt: number;
}

/** Console-free merge that prefers whichever source knows a richer field. */
function mergeOffer(existing: PendingOffer, incoming: PendingOffer): PendingOffer {
  return {
    ...incoming,
    title: incoming.title || existing.title,
    serviceName: incoming.serviceName || existing.serviceName,
    serviceCategory: incoming.serviceCategory ?? existing.serviceCategory,
    address: incoming.address ?? existing.address,
    distanceMeters: incoming.distanceMeters ?? existing.distanceMeters,
    amountPaise: incoming.amountPaise ?? existing.amountPaise,
    expiresAt: incoming.expiresAt ?? existing.expiresAt,
    offerExpiresAt: incoming.offerExpiresAt ?? existing.offerExpiresAt,
    jobOfferToken: incoming.jobOfferToken ?? existing.jobOfferToken,
    receivedAt: existing.receivedAt || incoming.receivedAt,
  };
}

/**
 * Guarantees every offer carries one canonical offer window (`offerExpiresAt`).
 *
 * The minted single-use offer token window is authoritative and kept verbatim. A
 * realtime `job:new` payload carries no minted token, so without this fallback
 * the offer would render no ring, no remaining time and no "Expires in" chip. In
 * that case the window is the default offer lifetime (`JOB_DEFAULTS.offerTtlMs`,
 * the server's `JOB_OFFER_TTL_MS`) measured from when the offer first reached
 * this pro (`receivedAt`). The job-level `expiresAt` is never used as an offer
 * deadline. An already-established window is carried through unchanged, so
 * duplicates, rerenders and navigation cannot reset a running countdown.
 */
function ensureOfferDeadline(offer: PendingOffer): PendingOffer {
  const deadline =
    offer.offerExpiresAt ??
    new Date(offer.receivedAt + JOB_DEFAULTS.offerTtlMs).toISOString();
  return { ...offer, offerExpiresAt: deadline };
}

/** An offer as persisted by the native AlertStore (rehydrated on foreground). */
export function toPendingOfferFromNative(native: PendingNativeJob): PendingOffer {
  return {
    jobId: native.jobId,
    title: native.title,
    serviceName: native.serviceName,
    serviceCategory: native.serviceCategory,
    address: native.address,
    distanceMeters: native.distanceMeters ? Number(native.distanceMeters) || null : null,
    amountPaise: native.amountPaise ? Number(native.amountPaise) || null : null,
    // The native store's `expiresAt` is the job-level expiry, so it never
    // becomes the offer window; `offerExpiresAt` is kept when a minted token
    // exists (ensureOfferDeadline fills the default window otherwise).
    expiresAt: null,
    offerExpiresAt: native.offerExpiresAt,
    jobOfferToken: native.jobOfferToken,
    receivedAt: native.receivedAt,
  };
}

/**
 * An open job from the realtime `job:new` event.
 *
 * The payload carries no minted offer window (that exists only on the FCM push,
 * where `offerExpiresAt` is attached), and its `expiresAt` is the job-level
 * "stops being pageable" time, not the offer stay actionable. The store derives
 * the offer deadline instead: `ensureOfferDeadline` applies the default offer
 * window from this offer's arrival time.
 */
export function toPendingOfferFromAvailableJob(job: AvailableJob): PendingOffer {
  return {
    jobId: job.id,
    title: `${job.service.name} job nearby`,
    serviceName: job.service.name,
    serviceCategory: job.customSkill ?? job.skill.name,
    address: job.locationLabel,
    distanceMeters:
      typeof job.distanceKm === 'number' && Number.isFinite(job.distanceKm)
        ? Math.round(job.distanceKm * 1000)
        : null,
    amountPaise: job.basePayPaise,
    expiresAt: null,
    offerExpiresAt: null,
    jobOfferToken: null,
    receivedAt: Date.now(),
  };
}

/** An offer from a foreground push's data (non-Android / no native module). */
export function toPendingOfferFromPushData(data: Record<string, unknown>): PendingOffer | null {
  const jobId = typeof data.jobId === 'string' ? data.jobId : undefined;
  if (!jobId) return null;
  const str = (key: string): string | null =>
    typeof data[key] === 'string' && data[key] !== '' ? (data[key] as string) : null;
  const dist = str('distanceMeters') ? Number(str('distanceMeters')) || null : null;
  const amount = str('amountPaise') ? Number(str('amountPaise')) || null : null;
  return {
    jobId,
    title: str('title') ?? '',
    serviceName: str('serviceName') ?? '',
    serviceCategory: str('serviceCategory'),
    address: str('address'),
    distanceMeters: dist,
    amountPaise: amount,
    // The push's `expiresAt` is the job-level expiry, not the offer window; the
    // store applies the default offer window from receipt when no minted token
    // is present (see ensureOfferDeadline).
    expiresAt: null,
    offerExpiresAt: str('offerExpiresAt'),
    jobOfferToken: str('jobOfferToken'),
    receivedAt: Date.now(),
  };
}

/**
 * The deadline that ends an offer — the canonical `offerExpiresAt` (the minted
 * token window, else the default offer window from receipt). The job-level
 * `expiresAt` is never an offer deadline.
 */
export function offerDeadlineMs(offer: PendingOffer): number | null {
  const raw = offer.offerExpiresAt;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isOfferExpired(offer: PendingOffer, now: number): boolean {
  const deadline = offerDeadlineMs(offer);
  return deadline !== null && deadline <= now;
}

/**
 * Fraction of the offer window still remaining, from 1 (just received) down to
 * 0 (window closed) — the raw value a countdown ring draws. Uses the same
 * deadline as the expiry pruning (the canonical offer window) and the
 * offer's own `receivedAt` as the window start, so the ring is driven by the
 * existing source of truth rather than a made-up timer. Returns `null` when
 * the offer carries no deadline (no countdown available).
 */
export function offerRemainingFraction(offer: PendingOffer, now: number): number | null {
  const deadline = offerDeadlineMs(offer);
  if (deadline === null) return null;
  const total = deadline - offer.receivedAt;
  if (total <= 0) return 0;
  const remaining = deadline - now;
  if (remaining <= 0) return 0;
  return Math.min(1, remaining / total);
}

interface IncomingOffersState {
  offersById: Record<string, PendingOffer>;
  /** Monotonic clock driven by the 1s tick, so countdowns re-render. */
  now: number;
  upsert: (offer: PendingOffer) => void;
  remove: (jobId: string) => void;
  clearAll: () => void;
  rehydrateFromNative: () => Promise<void>;
  /** Advances `now` and prunes offers whose window closed. */
  tick: () => void;
}

export const useIncomingOffersStore = create<IncomingOffersState>((set, get) => ({
  offersById: {},
  now: Date.now(),

  upsert: (offer) =>
    set((state) => {
      const existing = state.offersById[offer.jobId];
      const merged = existing ? mergeOffer(existing, offer) : offer;
      return {
        offersById: {
          ...state.offersById,
          [offer.jobId]: ensureOfferDeadline(merged),
        },
      };
    }),

  remove: (jobId) =>
    set((state) => {
      if (!(jobId in state.offersById)) return state;
      const rest: Record<string, PendingOffer> = {};
      for (const [id, offer] of Object.entries(state.offersById)) {
        if (id !== jobId) rest[id] = offer;
      }
      return { offersById: rest };
    }),

  clearAll: () => set({ offersById: {} }),

  rehydrateFromNative: async () => {
    try {
      const native = await getPendingNativeJobs();
      set((state) => {
        const next = { ...state.offersById };
        for (const item of native) {
          const jobId = item.jobId;
          const incoming = toPendingOfferFromNative(item);
          const existing = next[jobId];
          next[jobId] = ensureOfferDeadline(existing ? mergeOffer(existing, incoming) : incoming);
        }
        const now = Date.now();
        for (const [jobId, offer] of Object.entries(next)) {
          if (isOfferExpired(offer, now)) {
            delete next[jobId];
            void clearNativeJobAlert(jobId);
          }
        }
        return { offersById: next };
      });
    } catch {
      // Degrade to an empty/preserved store; never block foreground.
    }
  },

  tick: () => {
    const now = Date.now();
    const { offersById } = get();
    const expired = Object.entries(offersById).filter(([, offer]) => isOfferExpired(offer, now));
    if (expired.length === 0) {
      set({ now });
      return;
    }
    const next = { ...offersById };
    for (const [jobId] of expired) {
      delete next[jobId];
      void clearNativeJobAlert(jobId);
    }
    set({ now, offersById: next });
  },
}));

/** The pending offers as an array, newest arrival first (presentation sorting is the screen's). */
export function selectPendingOffers(state: IncomingOffersState): PendingOffer[] {
  return Object.values(state.offersById).sort((a, b) => b.receivedAt - a.receivedAt);
}

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { OTHER_SKILL_SLUG } from '@samona/types';
import type { SaveBookingCartRequest } from '@samona/validation';
import { useAuth } from './auth-provider';
import { cartServiceCount, useBookingDraft } from '@/stores/booking';
import { draftsApi } from '@/services/drafts';
import { clampQuantity, pricingModelOf } from '@/utils/pricing';

/** How long the cart may sit unchanged before it is written to the server. */
const SAVE_DEBOUNCE_MS = 700;

type DraftState = ReturnType<typeof useBookingDraft.getState>;

/**
 * The cart as the server expects it: what the customer wants, never a price.
 *
 * The shape mirrors the checkout request so a saved cart can always be
 * submitted later: one group per service, sharing the visit's notes and
 * photos. Photos without a storage path are still uploading, so they are left
 * out of this write — the upload finishing re-triggers a save. An empty cart
 * resolves to null and is cleared instead of written.
 */
function toSaveRequest(state: DraftState): SaveBookingCartRequest | null {
  const groups = state.groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      serviceSlug: group.service.slug,
      items: group.items.map((item) => {
        const model = pricingModelOf(item.skill);
        return {
          skillSlug: item.skill.slug,
          ...(item.skill.slug === OTHER_SKILL_SLUG
            ? { customSkill: item.customSkill.trim() }
            : {}),
          // The validator defaults a missing quantity to 1; sending it keeps
          // the payload explicit for every pricing model.
          quantity: model === 'PER_UNIT' ? clampQuantity(item.skill, item.quantity) : 1,
          ...(model === 'PER_HOUR' && item.durationMinutes !== null
            ? { durationMinutes: item.durationMinutes }
            : {}),
        };
      }),
    }));

  if (groups.length === 0) return null;

  return {
    description: state.description.trim(),
    imagePaths: state.images
      .map((image) => image.path)
      .filter((path): path is string => Boolean(path)),
    groups,
  };
}

/**
 * Keeps the customer's booking cart in step with its server copy.
 *
 * Mounted once inside the auth and query providers; renders nothing. The
 * store is the working copy the screens read, while the server rows are what
 * survive an app kill or a device switch:
 *
 * - On sign-in the saved cart is restored, but only when the customer has not
 *   already started building one locally (local edits always win).
 * - Edits are written back after a short debounce, and immediately when the
 *   app is backgrounded, so a cart is rarely more than a moment behind.
 * - Requests are serialised: a slow save can never land after a newer one and
 *   resurrect stale contents.
 * - An emptied cart abandons the server rows (DELETE) instead of writing an
 *   empty cart, keeping the history honest.
 * - Signing out drops the local copy and every sync marker; the server copy
 *   stays for the next sign-in.
 */
export function DraftSync(): null {
  const { isLoaded, isSignedIn, session } = useAuth();
  const userId = session?.user.id ?? null;

  /** The signed-in user the local cart currently belongs to. */
  const currentUser = useRef<string | null>(null);
  /** Set once a restore attempt for `currentUser` has settled. */
  const hydratedFor = useRef<string | null>(null);
  /** The exact payload last written, so identical edits cost no request. */
  const lastSynced = useRef<string | null>(null);
  /** Whether the server currently holds a non-empty cart for this user. */
  const hadCart = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Serialises writes so they land in the order the customer made them. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Follow the session. A new user starts with clean markers; signing out
  // drops the working copy without touching the durable one.
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !userId) {
      if (currentUser.current !== null) useBookingDraft.getState().reset();
      currentUser.current = null;
      hydratedFor.current = null;
      lastSynced.current = null;
      hadCart.current = false;
      return;
    }

    if (currentUser.current === userId) return;
    currentUser.current = userId;
    hydratedFor.current = null;
    lastSynced.current = null;
    hadCart.current = false;
  }, [isLoaded, isSignedIn, userId]);

  // Restore the saved cart once per signed-in user. Local edits made while the
  // read is in flight win: the customer is already building something newer.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    let active = true;

    void draftsApi
      .getCurrent()
      .then((cart) => {
        if (!active || hydratedFor.current === userId) return;

        const state = useBookingDraft.getState();
        hydratedFor.current = userId;

        if (state.groups.length > 0) {
          // The customer started a cart before the restore landed. Leave it
          // alone and let the normal save path write it back.
          lastSynced.current = null;
          return;
        }

        if (!cart || cart.groups.length === 0) {
          // Nothing to restore. Record the empty cart so the initial store
          // state never produces a pointless write.
          lastSynced.current = JSON.stringify(toSaveRequest(state));
          return;
        }

        state.hydrate(cart);
        hadCart.current = true;
        lastSynced.current = JSON.stringify(toSaveRequest(useBookingDraft.getState()));
      })
      .catch(() => {
        // Best-effort: a failed restore leaves the local cart as it was. The
        // customer can still book; the next edit will try to save again.
      });

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, userId]);

  // Subscribe once. The listener reads the live store rather than a captured
  // render, so it always writes the customer's latest cart.
  useEffect(() => {
    const enqueue = (task: () => Promise<void>) => {
      queue.current = queue.current.then(task, task);
    };

    const flush = () => {
      if (!currentUser.current) return;

      const state = useBookingDraft.getState();

      // An emptied cart abandons the saved copy instead of writing emptiness.
      if (cartServiceCount(state.groups) === 0) {
        if (!hadCart.current) return;
        hadCart.current = false;
        lastSynced.current = null;
        enqueue(async () => {
          try {
            await draftsApi.clear();
          } catch {
            // The rows may still exist; the next edit retries the write.
            hadCart.current = true;
          }
        });
        return;
      }

      const payload = toSaveRequest(state);
      if (!payload) return;

      const snapshot = JSON.stringify(payload);
      if (snapshot === lastSynced.current) return;

      lastSynced.current = snapshot;
      hadCart.current = true;
      enqueue(async () => {
        try {
          await draftsApi.save(payload);
        } catch {
          // Keep the working copy. Clearing the marker makes the next edit (or
          // the next launch) write the cart again.
          if (lastSynced.current === snapshot) lastSynced.current = null;
        }
      });
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, SAVE_DEBOUNCE_MS);
    };

    const unsubscribe = useBookingDraft.subscribe(schedule);

    // Backgrounding is the last reliable moment before the OS may suspend us.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      flush();
    });

    return () => {
      unsubscribe();
      appState.remove();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  return null;
}

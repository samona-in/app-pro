import { useCallback, useEffect, useRef, useState } from 'react';

export interface SubmitGuardOptions {
  /** Minimum gap between accepted presses, in milliseconds. */
  cooldownMs?: number;
}

/**
 * Prevents duplicate submissions from a single user action.
 *
 * Two distinct problems, both real on mobile:
 *  - a double tap firing an action twice (two jobs accepted, two payments)
 *  - an impatient user tapping repeatedly while a request is in flight, each
 *    tap costing a request against the server's rate limit
 *
 * Wrapping the handler is more reliable than disabling the button, because the
 * guard cannot be defeated by a re-render restoring the enabled state.
 *
 * This is a UX and self-inflicted-load protection, not a security control:
 * the server still enforces idempotency and limits. It cannot be trusted, so
 * it is not relied upon.
 */
export function useSubmitGuard<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<void> | void,
  { cooldownMs = 800 }: SubmitGuardOptions = {},
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastRunAt = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // The handler may resolve after the screen is gone; setting state then
      // would warn and, worse, retain the unmounted tree.
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs) => {
      const now = Date.now();
      if (inFlight.current) return;
      if (now - lastRunAt.current < cooldownMs) return;

      lastRunAt.current = now;
      inFlight.current = true;
      if (mounted.current) setIsSubmitting(true);

      try {
        await handler(...args);
      } finally {
        inFlight.current = false;
        if (mounted.current) setIsSubmitting(false);
      }
    },
    [handler, cooldownMs],
  );

  return { run, isSubmitting };
}

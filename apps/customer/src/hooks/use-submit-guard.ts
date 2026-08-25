import { useCallback, useEffect, useRef, useState } from 'react';

export interface SubmitGuardOptions {
  cooldownMs?: number;
}

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

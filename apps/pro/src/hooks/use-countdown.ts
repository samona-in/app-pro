import { useCallback, useEffect, useState } from 'react';

/** Half a second keeps a seconds-based label from visibly lagging. */
const TICK_MS = 500;

export interface Countdown {
  /** Whole seconds left, rounded up so "1" shows until the timer really ends. */
  remainingSeconds: number;
  /** False once the countdown has run out. */
  isActive: boolean;
  /** Runs the countdown again from its original duration. */
  restart: () => void;
}

/**
 * A self-stopping countdown that starts as soon as it mounts, used to gate
 * actions like "Resend code".
 *
 * Ticks are derived from a deadline rather than being accumulated, so a slow
 * render or a suspended timer cannot make the countdown drift long.
 */
export function useCountdown(durationMs: number): Countdown {
  const [deadline, setDeadline] = useState(() => Date.now() + durationMs);
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    function tick() {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs((current) => (current === left ? current : left));
      return left;
    }

    const timer = setInterval(() => {
      if (tick() === 0) clearInterval(timer);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [deadline]);

  const restart = useCallback(() => {
    setDeadline(Date.now() + durationMs);
    setRemainingMs(durationMs);
  }, [durationMs]);

  return {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isActive: remainingMs > 0,
    restart,
  };
}

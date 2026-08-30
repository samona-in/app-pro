import { useEffect, useState } from 'react';
import { Text } from '@/components/ui';
import { cn } from '@/utils/cn';

function formatRemaining(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Live countdown to an offer's expiry.
 *
 * The remaining time is derived from the deadline and a ticking clock — never
 * stored as its own piece of state — and the interval only touches state from
 * its own callback, so this is a plain render computation (CLAUDE.md
 * "UI"). The server, not this clock, is what actually expires the offer.
 */
export function OfferCountdown({
  expiresAt,
  className,
}: {
  expiresAt: string | null;
  className?: string;
}) {
  const deadline = expiresAt ? new Date(expiresAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const remaining =
    deadline === null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor((deadline - now) / 1000));
  const expired = remaining === 0 && deadline !== null;

  return (
    <Text
      variant="footnote"
      accessibilityLabel={expired ? 'Offer expired' : `Offer expires in ${remaining} seconds`}
      className={cn('font-semibold', expired ? 'text-text-muted' : 'text-warning', className)}
    >
      {deadline !== null ? (expired ? 'Expired' : formatRemaining(remaining)) : '—'}
    </Text>
  );
}
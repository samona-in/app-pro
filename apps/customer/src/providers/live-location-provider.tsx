import type { ReactNode } from 'react';
import { useLiveLocation } from '@/hooks/use-live-location';

/**
 * Keeps the customer's active location in step with the device.
 *
 * Mounted once, above the navigator, so the location is refreshed whether the
 * customer lands on the home screen, a booking or a chat thread.
 */
export function LiveLocationProvider({ children }: { children: ReactNode }) {
  useLiveLocation();
  return <>{children}</>;
}

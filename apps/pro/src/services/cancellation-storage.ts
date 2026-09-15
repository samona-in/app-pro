import {
  clearNativeCancellation,
  getNativeCancellations,
  presentNativeCancellation,
} from './overlay-alert';

/**
 * Cross-platform persistence for unacknowledged customer cancellations.
 *
 * On Android the native AlertStore is the durable record (it outlives the JS
 * process and is written by both the FCM push handler and the socket bridge),
 * so the persistence contract here IS the native store: read it to rehydrate,
 * write through it to present, clear it on acknowledge. On iOS there is no
 * native venue and no dead-process push, so every path degrades to an empty
 * read / no-op write — the socket event alone drives the one alert while the
 * process is alive.
 */

export interface StoredCancellation {
  jobId: string;
  cancelledAt: string;
}

/** The native-persisted cancellations to rehydrate, newest first. */
export async function loadStoredCancellations(): Promise<StoredCancellation[]> {
  try {
    return await getNativeCancellations();
  } catch {
    return [];
  }
}

/**
 * Presents a cancellation through the native venue (vibration, optional tray)
 * and returns whether this was its first presentation.
 */
export async function presentStoredCancellation(
  jobId: string,
  cancelledAt: string,
  showNotification: boolean,
): Promise<boolean> {
  try {
    const { isNew } = await presentNativeCancellation(jobId, cancelledAt, showNotification);
    return isNew;
  } catch {
    return false;
  }
}

/** Clear a cancellation across the native store, tray and vibration. */
export async function clearStoredCancellation(jobId: string): Promise<void> {
  try {
    await clearNativeCancellation(jobId);
  } catch {
    // Acknowledge must close the modal regardless of the native write.
  }
}
export interface ProLocation {
  bookingId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: string;
  sequence: number;
}

export interface BookingTrackingStatus {
  bookingId: string;
  isAvailable: boolean;
  lastLocationAt: string | null;
  lastUpdatedAt: string;
  lastError?: string | null;
}

export interface TrackingUnavailablePayload {
  bookingId: string;
  reason?: string;
  at: string;
}

export interface TrackingRestoredPayload {
  bookingId: string;
  at: string;
}

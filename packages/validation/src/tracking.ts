import { z } from 'zod';
import { coordinatesSchema } from './primitives';

export const proLocationUpdateSchema = z.object({
  bookingId: z.string().uuid('Must be a valid booking id.'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
  speed: z.number().min(-1).optional(),
  heading: z.number().min(-360).max(360).optional(),
  recordedAt: z.string().datetime().optional(),
  sequence: z.number().int().min(0),
});

export type ProLocationUpdateInput = z.infer<typeof proLocationUpdateSchema>;

export const trackingSubscribeSchema = z.object({
  bookingId: z.string().uuid('Must be a valid booking id.'),
});

export type TrackingSubscribeInput = z.infer<typeof trackingSubscribeSchema>;

export const trackingUnsubscribeSchema = z.object({
  bookingId: z.string().uuid('Must be a valid booking id.'),
});

export type TrackingUnsubscribeInput = z.infer<typeof trackingUnsubscribeSchema>;

export const trackingStatusSchema = z.object({
  bookingId: z.string().uuid('Must be a valid booking id.'),
  status: z.enum(['available', 'unavailable']),
  reason: z.string().optional(),
});

export type TrackingStatusInput = z.infer<typeof trackingStatusSchema>;

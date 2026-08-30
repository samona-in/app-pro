import { z } from 'zod';
import { ORDER_LIFECYCLE } from '@samona/config';
import { photoUrlSchema } from './files';

/**
 * Input schemas for the order-service lifecycle, shared by the apps and the
 * API (architecture §29). Server-side validation is authoritative; the app's
 * checks are a UX convenience only.
 *
 * Server-controlled fields — status, selectedProId, finalPrice, distances —
 * are absent by construction, so a client can neither assert nor forge them.
 */

/** Values a customer may state when filing a request. */
export const createServiceRequestSchema = z.object({
  serviceId: z.uuid({ message: 'Choose a service.' }),
  description: z
    .string()
    .trim()
    .max(2000, 'Keep the description under 2000 characters.')
    .optional(),
  photos: z
    .array(photoUrlSchema)
    .max(8, 'Attach at most 8 photos.')
    .optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().trim().max(300, 'Address must be 300 characters or fewer.').optional(),
  /** V1 quote anchor in rupees. Optional; not a price anyone can change later. */
  estimatedPrice: z.number().int().min(0).max(10_000_000).optional(),
});

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;

/** Identifies one responder from the customer's shortlist. */
export const selectProSchema = z.object({
  respondType: z.enum(['offer', 'interest'], { message: 'Pick a valid responder.' }),
  responderId: z.uuid({ message: 'Pick a valid professional.' }),
});

export type SelectProInput = z.infer<typeof selectProSchema>;

/** Cancelling a request carries no fields; who may cancel is a server rule. */
export const cancelRequestSchema = z.strictObject({});

export const acceptOfferSchema = z.strictObject({});

export const declineOfferSchema = z.strictObject({});

/** A pro expressing interest in an open request. */
export const createProInterestSchema = z.object({
  serviceRequestId: z.uuid(),
});

export type CreateProInterestInput = z.infer<typeof createProInterestSchema>;

/**
 * The pro's online/offline switch.
 *
 * Coming online in earnest requires coordinates — the marketplace cannot match
 * a pro whose location is unknown. Going offline never needs them.
 */
export const availabilityPatchSchema = z
  .object({
    isOnline: z.boolean(),
    coordinates: z
      .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
      .optional(),
    locationLabel: z.string().trim().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isOnline && !value.coordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coordinates'],
        message: 'Going online requires your current location.',
      });
    }
  });

export type AvailabilityPatchInput = z.infer<typeof availabilityPatchSchema>;

/** On-site job transitions; a note is optional context, never historical truth. */
export const jobTransitionSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

export type JobTransitionInput = z.infer<typeof jobTransitionSchema>;

/** Marking a completed job paid carries no fields for V1. */
export const confirmPaymentSchema = z.strictObject({});

/**
 * Limits an open job's interest list because dispatch batches share a ceiling
 * too — the two markets must not disagree about how many pros a request can
 * realistically see.
 */
export const maxInterestedPros = ORDER_LIFECYCLE.maxInterestedPros;
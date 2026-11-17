import { z } from 'zod';

/**
 * The subset of Twilio Verify Message Status Stream events this server keeps.
 *
 * Twilio owns the upstream contract; the schema is deliberately tolerant of
 * extra properties and missing optional fields so a provider-side addition
 * cannot start rejecting every callback (and, with it, lose delivery data).
 * `data.to` and `data.message_status` are the only fields that make an event
 * useful, so those are required.
 */
const statusSchema = z.enum(['SENT', 'DELIVERED', 'READ', 'UNDELIVERED', 'FAILED']);

export const twilioVerifyEventSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(96),
    time: z.string().optional(),
    data: z
      .object({
        verification_sid: z.string().max(34).optional(),
        attempt_sid: z.string().max(34).optional(),
        to: z.string().min(1),
        channel: z.string().max(16).optional(),
        // Twilio sends MCC/MNC as strings, but tolerate numbers so a shape
        // change degrades to stringified values instead of dropping evidence.
        mcc: z.union([z.string(), z.number()]).optional(),
        mnc: z.union([z.string(), z.number()]).optional(),
        number_segments: z.number().int().optional(),
        message_status: z.string().optional(),
      })
      .loose(),
  })
  .loose();

export type TwilioVerifyEvent = z.infer<typeof twilioVerifyEventSchema>;

export type OtpDeliveryStatus = z.infer<typeof statusSchema>;

/** Twilio's documented status vocabulary is upper-case; accept either case. */
export function normaliseStatus(
  value: string | undefined,
  eventType: string,
): OtpDeliveryStatus | null {
  const candidate = (value ?? eventType.split('.').pop() ?? '').toUpperCase();
  const parsed = statusSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Event Streams sends a JSON array; accept a single object for local testing. */
export function parseEventPayload(raw: string): unknown[] {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

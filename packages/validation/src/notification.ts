import { z } from 'zod';

/**
 * Input schemas for the notifications domain, shared by the app and the API.
 *
 * A Pro's own push settings are scoped by the verified token; nothing here is
 * trusted as an identity (CLAUDE.md "Security").
 *
 * `publishableToken` is the *device* Expo push token — a public identifier
 * issued to the app on the device. It is stored to deliver pushes and is not a
 * secret. We still bound its shape so a garbage value cannot be accepted.
 */
export const expoPushTokenSchema = z
  .string()
  .min(1, 'Push token is required.')
  .max(512, 'Push token is too long.');

/** Registers (or replaces) this Pro's device push token. */
export const pushPlatformSchema = z.enum(['ios', 'android']);

export type PushPlatformInput = z.infer<typeof pushPlatformSchema>;

export const registerPushTokenSchema = z.object({
  pushToken: expoPushTokenSchema,
  /**
   * The OS the token was minted on. Not trusted as identity — it only shapes the
   * push payload on our side (Android needs data-only messages so the native
   * full-screen service runs when the app is closed; iOS needs a display alert).
   */
  platform: pushPlatformSchema,
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

/**
 * The Pro's job-alert preference. Only `jobAlertsEnabled` is client-settable —
 * the push token itself is managed through `registerPushTokenSchema`.
 */
export const pushSettingsSchema = z.object({
  jobAlertsEnabled: z.boolean(),
});

export type PushSettingsInput = z.infer<typeof pushSettingsSchema>;

/** Lists a Pro's own notification history. */
export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

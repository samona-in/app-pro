import { z } from 'zod';
import { deviceIdSchema } from './job';

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

/** Which push provider a registered token belongs to. */
export const pushProviderSchema = z.enum(['expo', 'fcm']);

export type PushProviderInput = z.infer<typeof pushProviderSchema>;

export const registerPushTokenSchema = z.object({
  pushToken: expoPushTokenSchema,
  /**
   * The OS the token was minted on. Not trusted as identity — it only shapes the
   * push payload on our side (Android needs data-only messages so the native
   * full-screen service runs when the app is closed; iOS needs a display alert).
   */
  platform: pushPlatformSchema,
  /**
   * Which push provider the token belongs to: `expo` (the Expo push service,
   * iOS and the fallback path) or `fcm` (a raw Firebase registration token,
   * Android). Controls which delivery channel the server uses.
   */
  provider: pushProviderSchema,
  /**
   * The per-install device id minted by the Android job-alert module. The
   * server stores it so every minted job-offer token is bound to this device
   * and only redeemable from it. Optional for backwards compatibility.
   */
  deviceId: deviceIdSchema.optional(),
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z.object({
  deviceId: deviceIdSchema.optional(),
  pushToken: expoPushTokenSchema.optional(),
}).refine((value) => value.deviceId || value.pushToken, 'A device or push token is required.');

export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>;

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



// ==================== Admin Campaign Validation ====================

const emptyStringToUndefined = z.preprocess((v) => {
  if (typeof v === 'string' && v.trim() === '') return undefined;
  return v;
}, z.unknown());

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  imageUrl: emptyStringToUndefined.pipe(z.string().url()).optional(),
  type: z.enum(['PROMOTIONAL_OFFERS', 'BOOKING_REMINDERS', 'PRO_ENGAGEMENT', 'NEW_SERVICE_ANNOUNCEMENTS', 'APPLICATION_UPDATES', 'IMPORTANT_ANNOUNCEMENTS', 'CUSTOM_NOTIFICATIONS']),
  audience: z.enum(['ALL_CUSTOMERS', 'ALL_PROFESSIONALS', 'EVERYONE', 'VERIFIED_PROFESSIONALS', 'OFFLINE_PROFESSIONALS', 'ONLINE_PROFESSIONALS', 'PROFESSIONALS_INCOMPLETE_PROFILES', 'CUSTOMERS_NOT_BOOKED_RECENTLY', 'CUSTOMERS_WITH_COMPLETED_BOOKINGS', 'CITY_BASED', 'CUSTOM']),
  audienceFilters: z.any().optional(),
  deepLink: emptyStringToUndefined.pipe(z.string()).optional(),
  sendNow: z.boolean().optional(),
  scheduledAt: emptyStringToUndefined.pipe(z.string()).optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial();

export const sendCampaignSchema = z.object({
  testMode: z.boolean().optional(),
  testToken: z.string().optional(),
}).passthrough().optional();

export const createAutomationSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['OFFLINE_REMINDER', 'PROFILE_COMPLETION_REMINDER', 'VERIFICATION_REMINDER', 'ENGAGEMENT_REMINDER', 'BOOKING_REMINDER', 'UPCOMING_BOOKING_REMINDER', 'SERVICE_ANNOUNCEMENT']),
  enabled: z.boolean().optional(),
  triggerConfig: z.any(),
  template: z.any(),
  cooldownHours: z.number().int().min(0).optional(),
  maxPerDay: z.number().int().min(0).optional(),
  quietHoursStart: z.number().int().min(0).max(23).optional().nullable(),
  quietHoursEnd: z.number().int().min(0).max(23).optional().nullable(),
  audienceFilters: z.any().optional(),
});

export const updateAutomationSchema = createAutomationSchema.partial();

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

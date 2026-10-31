"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAutomationSchema = exports.createAutomationSchema = exports.sendCampaignSchema = exports.updateCampaignSchema = exports.createCampaignSchema = exports.notificationListQuerySchema = exports.pushSettingsSchema = exports.unregisterPushTokenSchema = exports.registerPushTokenSchema = exports.pushProviderSchema = exports.pushPlatformSchema = exports.expoPushTokenSchema = void 0;
const zod_1 = require("zod");
const job_1 = require("./job");
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
exports.expoPushTokenSchema = zod_1.z
    .string()
    .min(1, 'Push token is required.')
    .max(512, 'Push token is too long.');
/** Registers (or replaces) this Pro's device push token. */
exports.pushPlatformSchema = zod_1.z.enum(['ios', 'android']);
/** Which push provider a registered token belongs to. */
exports.pushProviderSchema = zod_1.z.enum(['expo', 'fcm']);
exports.registerPushTokenSchema = zod_1.z.object({
    pushToken: exports.expoPushTokenSchema,
    /**
     * The OS the token was minted on. Not trusted as identity — it only shapes the
     * push payload on our side (Android needs data-only messages so the native
     * full-screen service runs when the app is closed; iOS needs a display alert).
     */
    platform: exports.pushPlatformSchema,
    /**
     * Which push provider the token belongs to: `expo` (the Expo push service,
     * iOS and the fallback path) or `fcm` (a raw Firebase registration token,
     * Android). Controls which delivery channel the server uses.
     */
    provider: exports.pushProviderSchema,
    /**
     * The per-install device id minted by the Android job-alert module. The
     * server stores it so every minted job-offer token is bound to this device
     * and only redeemable from it. Optional for backwards compatibility.
     */
    deviceId: job_1.deviceIdSchema.optional(),
});
exports.unregisterPushTokenSchema = zod_1.z.object({
    deviceId: job_1.deviceIdSchema.optional(),
    pushToken: exports.expoPushTokenSchema.optional(),
}).refine((value) => value.deviceId || value.pushToken, 'A device or push token is required.');
/**
 * The Pro's job-alert preference. Only `jobAlertsEnabled` is client-settable —
 * the push token itself is managed through `registerPushTokenSchema`.
 */
exports.pushSettingsSchema = zod_1.z.object({
    jobAlertsEnabled: zod_1.z.boolean(),
});
/** Lists a Pro's own notification history. */
exports.notificationListQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
    cursor: zod_1.z.string().optional(),
});
// ==================== Admin Campaign Validation ====================
const emptyStringToUndefined = zod_1.z.preprocess((v) => {
    if (typeof v === 'string' && v.trim() === '')
        return undefined;
    return v;
}, zod_1.z.unknown());
exports.createCampaignSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    title: zod_1.z.string().min(1).max(100),
    body: zod_1.z.string().min(1).max(500),
    imageUrl: emptyStringToUndefined.pipe(zod_1.z.string().url()).optional(),
    type: zod_1.z.enum(['PROMOTIONAL_OFFERS', 'BOOKING_REMINDERS', 'PRO_ENGAGEMENT', 'NEW_SERVICE_ANNOUNCEMENTS', 'APPLICATION_UPDATES', 'IMPORTANT_ANNOUNCEMENTS', 'CUSTOM_NOTIFICATIONS']),
    audience: zod_1.z.enum(['ALL_CUSTOMERS', 'ALL_PROFESSIONALS', 'EVERYONE', 'VERIFIED_PROFESSIONALS', 'OFFLINE_PROFESSIONALS', 'ONLINE_PROFESSIONALS', 'PROFESSIONALS_INCOMPLETE_PROFILES', 'CUSTOMERS_NOT_BOOKED_RECENTLY', 'CUSTOMERS_WITH_COMPLETED_BOOKINGS', 'CITY_BASED', 'CUSTOM']),
    audienceFilters: zod_1.z.any().optional(),
    deepLink: emptyStringToUndefined.pipe(zod_1.z.string()).optional(),
    sendNow: zod_1.z.boolean().optional(),
    scheduledAt: emptyStringToUndefined.pipe(zod_1.z.string()).optional(),
});
exports.updateCampaignSchema = exports.createCampaignSchema.partial();
exports.sendCampaignSchema = zod_1.z.object({
    testMode: zod_1.z.boolean().optional(),
    testToken: zod_1.z.string().optional(),
}).passthrough().optional();
exports.createAutomationSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: zod_1.z.enum(['OFFLINE_REMINDER', 'PROFILE_COMPLETION_REMINDER', 'VERIFICATION_REMINDER', 'ENGAGEMENT_REMINDER', 'BOOKING_REMINDER', 'UPCOMING_BOOKING_REMINDER', 'SERVICE_ANNOUNCEMENT']),
    enabled: zod_1.z.boolean().optional(),
    triggerConfig: zod_1.z.any(),
    template: zod_1.z.any(),
    cooldownHours: zod_1.z.number().int().min(0).optional(),
    maxPerDay: zod_1.z.number().int().min(0).optional(),
    quietHoursStart: zod_1.z.number().int().min(0).max(23).optional().nullable(),
    quietHoursEnd: zod_1.z.number().int().min(0).max(23).optional().nullable(),
    audienceFilters: zod_1.z.any().optional(),
});
exports.updateAutomationSchema = exports.createAutomationSchema.partial();
//# sourceMappingURL=notification.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationListQuerySchema = exports.pushSettingsSchema = exports.registerPushTokenSchema = exports.pushProviderSchema = exports.pushPlatformSchema = exports.expoPushTokenSchema = void 0;
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
//# sourceMappingURL=notification.js.map
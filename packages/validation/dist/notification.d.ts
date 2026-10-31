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
export declare const expoPushTokenSchema: z.ZodString;
/** Registers (or replaces) this Pro's device push token. */
export declare const pushPlatformSchema: z.ZodEnum<{
    ios: "ios";
    android: "android";
}>;
export type PushPlatformInput = z.infer<typeof pushPlatformSchema>;
/** Which push provider a registered token belongs to. */
export declare const pushProviderSchema: z.ZodEnum<{
    expo: "expo";
    fcm: "fcm";
}>;
export type PushProviderInput = z.infer<typeof pushProviderSchema>;
export declare const registerPushTokenSchema: z.ZodObject<{
    pushToken: z.ZodString;
    platform: z.ZodEnum<{
        ios: "ios";
        android: "android";
    }>;
    provider: z.ZodEnum<{
        expo: "expo";
        fcm: "fcm";
    }>;
    deviceId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
export declare const unregisterPushTokenSchema: z.ZodObject<{
    deviceId: z.ZodOptional<z.ZodString>;
    pushToken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>;
/**
 * The Pro's job-alert preference. Only `jobAlertsEnabled` is client-settable —
 * the push token itself is managed through `registerPushTokenSchema`.
 */
export declare const pushSettingsSchema: z.ZodObject<{
    jobAlertsEnabled: z.ZodBoolean;
}, z.core.$strip>;
export type PushSettingsInput = z.infer<typeof pushSettingsSchema>;
/** Lists a Pro's own notification history. */
export declare const notificationListQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
//# sourceMappingURL=notification.d.ts.map
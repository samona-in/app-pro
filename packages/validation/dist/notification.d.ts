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
export declare const createCampaignSchema: z.ZodObject<{
    name: z.ZodString;
    title: z.ZodString;
    body: z.ZodString;
    imageUrl: z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodUnknown, unknown>, z.ZodString>>;
    type: z.ZodEnum<{
        PROMOTIONAL_OFFERS: "PROMOTIONAL_OFFERS";
        BOOKING_REMINDERS: "BOOKING_REMINDERS";
        PRO_ENGAGEMENT: "PRO_ENGAGEMENT";
        NEW_SERVICE_ANNOUNCEMENTS: "NEW_SERVICE_ANNOUNCEMENTS";
        APPLICATION_UPDATES: "APPLICATION_UPDATES";
        IMPORTANT_ANNOUNCEMENTS: "IMPORTANT_ANNOUNCEMENTS";
        CUSTOM_NOTIFICATIONS: "CUSTOM_NOTIFICATIONS";
    }>;
    audience: z.ZodEnum<{
        ALL_CUSTOMERS: "ALL_CUSTOMERS";
        ALL_PROFESSIONALS: "ALL_PROFESSIONALS";
        EVERYONE: "EVERYONE";
        VERIFIED_PROFESSIONALS: "VERIFIED_PROFESSIONALS";
        OFFLINE_PROFESSIONALS: "OFFLINE_PROFESSIONALS";
        ONLINE_PROFESSIONALS: "ONLINE_PROFESSIONALS";
        PROFESSIONALS_INCOMPLETE_PROFILES: "PROFESSIONALS_INCOMPLETE_PROFILES";
        CUSTOMERS_NOT_BOOKED_RECENTLY: "CUSTOMERS_NOT_BOOKED_RECENTLY";
        CUSTOMERS_WITH_COMPLETED_BOOKINGS: "CUSTOMERS_WITH_COMPLETED_BOOKINGS";
        CITY_BASED: "CITY_BASED";
        CUSTOM: "CUSTOM";
    }>;
    audienceFilters: z.ZodOptional<z.ZodAny>;
    deepLink: z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodUnknown, unknown>, z.ZodString>>;
    sendNow: z.ZodOptional<z.ZodBoolean>;
    scheduledAt: z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodUnknown, unknown>, z.ZodString>>;
}, z.core.$strip>;
export declare const updateCampaignSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodUnknown, unknown>, z.ZodString>>>;
    type: z.ZodOptional<z.ZodEnum<{
        PROMOTIONAL_OFFERS: "PROMOTIONAL_OFFERS";
        BOOKING_REMINDERS: "BOOKING_REMINDERS";
        PRO_ENGAGEMENT: "PRO_ENGAGEMENT";
        NEW_SERVICE_ANNOUNCEMENTS: "NEW_SERVICE_ANNOUNCEMENTS";
        APPLICATION_UPDATES: "APPLICATION_UPDATES";
        IMPORTANT_ANNOUNCEMENTS: "IMPORTANT_ANNOUNCEMENTS";
        CUSTOM_NOTIFICATIONS: "CUSTOM_NOTIFICATIONS";
    }>>;
    audience: z.ZodOptional<z.ZodEnum<{
        ALL_CUSTOMERS: "ALL_CUSTOMERS";
        ALL_PROFESSIONALS: "ALL_PROFESSIONALS";
        EVERYONE: "EVERYONE";
        VERIFIED_PROFESSIONALS: "VERIFIED_PROFESSIONALS";
        OFFLINE_PROFESSIONALS: "OFFLINE_PROFESSIONALS";
        ONLINE_PROFESSIONALS: "ONLINE_PROFESSIONALS";
        PROFESSIONALS_INCOMPLETE_PROFILES: "PROFESSIONALS_INCOMPLETE_PROFILES";
        CUSTOMERS_NOT_BOOKED_RECENTLY: "CUSTOMERS_NOT_BOOKED_RECENTLY";
        CUSTOMERS_WITH_COMPLETED_BOOKINGS: "CUSTOMERS_WITH_COMPLETED_BOOKINGS";
        CITY_BASED: "CITY_BASED";
        CUSTOM: "CUSTOM";
    }>>;
    audienceFilters: z.ZodOptional<z.ZodOptional<z.ZodAny>>;
    deepLink: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodUnknown, unknown>, z.ZodString>>>;
    sendNow: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    scheduledAt: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodUnknown, unknown>, z.ZodString>>>;
}, z.core.$strip>;
export declare const sendCampaignSchema: z.ZodOptional<z.ZodObject<{
    testMode: z.ZodOptional<z.ZodBoolean>;
    testToken: z.ZodOptional<z.ZodString>;
}, z.core.$loose>>;
export declare const createAutomationSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<{
        OFFLINE_REMINDER: "OFFLINE_REMINDER";
        PROFILE_COMPLETION_REMINDER: "PROFILE_COMPLETION_REMINDER";
        VERIFICATION_REMINDER: "VERIFICATION_REMINDER";
        ENGAGEMENT_REMINDER: "ENGAGEMENT_REMINDER";
        BOOKING_REMINDER: "BOOKING_REMINDER";
        UPCOMING_BOOKING_REMINDER: "UPCOMING_BOOKING_REMINDER";
        SERVICE_ANNOUNCEMENT: "SERVICE_ANNOUNCEMENT";
    }>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    triggerConfig: z.ZodAny;
    template: z.ZodAny;
    cooldownHours: z.ZodOptional<z.ZodNumber>;
    maxPerDay: z.ZodOptional<z.ZodNumber>;
    quietHoursStart: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    quietHoursEnd: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    audienceFilters: z.ZodOptional<z.ZodAny>;
}, z.core.$strip>;
export declare const updateAutomationSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<{
        OFFLINE_REMINDER: "OFFLINE_REMINDER";
        PROFILE_COMPLETION_REMINDER: "PROFILE_COMPLETION_REMINDER";
        VERIFICATION_REMINDER: "VERIFICATION_REMINDER";
        ENGAGEMENT_REMINDER: "ENGAGEMENT_REMINDER";
        BOOKING_REMINDER: "BOOKING_REMINDER";
        UPCOMING_BOOKING_REMINDER: "UPCOMING_BOOKING_REMINDER";
        SERVICE_ANNOUNCEMENT: "SERVICE_ANNOUNCEMENT";
    }>>;
    enabled: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    triggerConfig: z.ZodOptional<z.ZodAny>;
    template: z.ZodOptional<z.ZodAny>;
    cooldownHours: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    maxPerDay: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    quietHoursStart: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNumber>>>;
    quietHoursEnd: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNumber>>>;
    audienceFilters: z.ZodOptional<z.ZodOptional<z.ZodAny>>;
}, z.core.$strip>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
//# sourceMappingURL=notification.d.ts.map
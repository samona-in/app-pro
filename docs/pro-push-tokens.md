# Pro device push registrations

The existing notifications service owns registration and delivery. Each Pro app
installation now has a `ProPushDevice` linked to its `ProProfile`. The native
Android job-alert device id is reused, so every device receives its own signed
job offer and can redeem it through the existing overlay. iOS persists a unique
installation id in Secure Store. The profile's push fields remain a compatibility
mirror for older callers; job alerts, repeats, terminal events, assigned-job
cancellations, and Pro chat delivery prefer the device registrations.

On login and persisted-session startup, the app fetches its current native token.
It listens through Expo's `addPushTokenListener`, and re-fetches on foreground.
The Android messaging service already inherits Expo's `onNewToken` handling, so
no native background handler, channel, sound, or overlay implementation changes.
Native refresh callbacks use the supplied token instead of fetching recursively.

Registration uploads are serialized, scoped to the authenticated user, and pinned
to that session's bearer. Transient API and native/network failures retry with
capped exponential backoff and jitter, honoring `Retry-After`. A newer token
replaces the pending value. Listeners and retries stop on sign-out or session
change. API validation/auth failures wait for a new token/session event.

Logout stops uploads, waits for an in-flight upload, and calls
`POST /notifications/unregister-token` while authentication is still available.
The server scopes deletion to the authenticated Pro and the supplied installation.
Offline logout leaves a Secure Store cleanup marker, retried before the same
Pro's next registration. A different Pro signing in transfers this installation
atomically. Until the server is reachable, an offline logout cannot immediately
remove a remote registration. Other devices' registrations remain intact.

Firebase's structured `UNREGISTERED` error removes only rows matching the rejected
token, including a matching legacy profile mirror. A late failure for an old
token cannot erase a newer token. The service suppresses further sends from
already-loaded batches after rejection and retries failed database cleanup.
Generic 404s, malformed payloads, credentials errors, and transient provider
failures do not delete tokens. Expo cleanup likewise uses the exact sent token
and `details.error === 'DeviceNotRegistered'`.

Server logs identify tokens with a SHA-256 fingerprint. App logs show only a
short suffix (short tokens are fully redacted). Raw provider messages and
token-bearing database exceptions are excluded from lifecycle/delivery logs.

## Configuration and rollout

Local configuration verified on 2026-10-31:

- Pro Android package and Firebase Android client: `in.samona.pro`.
- `apps/pro/google-services.json` Firebase project: `samona-9696`.
- Root/server `FCM_PROJECT_ID`: `samona-9696`; service-account project matches.
- Android uploads `getDevicePushTokenAsync().data` with provider `fcm`.
- iOS converts its native APNs token to an Expo push token with provider `expo`.
  APNs tokens and Expo push tokens are never used for direct FCM sends.

Deploy the `20261031130000_pro_push_devices` migration and regenerate Prisma
before running the new backend. It backfills live profile registrations and
assigns a legacy installation key when an old registration lacks a device id.
Then ship the updated Pro app. Existing clients retain the registration endpoint
and legacy profile compatibility; multiple devices become known as they register.

EAS can override the local Google services file with `GOOGLE_SERVICES_JSON`, and
the deployed backend reads its credentials from its runtime environment. Verify
those deployed values match the same Firebase project before release. Local
checks do not establish the contents of cloud secrets or a released APK.

Device acceptance check: sign in on two Android devices, receive an incoming job
on both, confirm sounds/overlays and terminal clearing, log out on one, and verify
only the other receives the next alert. Rotate a token or reinstall and confirm
the next startup registers the new token. Test a network outage during login and
logout, then reconnect and confirm synchronization recovers.

References: [Expo token APIs](https://docs.expo.dev/versions/latest/sdk/notifications/#fetch-tokens-for-push-notifications),
[Firebase error codes](https://firebase.google.com/docs/cloud-messaging/error-codes),
[Firebase token management](https://firebase.google.com/docs/cloud-messaging/manage-tokens).

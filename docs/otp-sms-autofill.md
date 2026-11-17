# OTP SMS autofill (Android Retriever + iOS one-time-code)

Both apps sign in with a phone number and a 4-digit Supabase Auth OTP
(`OTP_LENGTH` in `packages/config/src/constants.ts`). This document covers how
the code fills itself in — Android's zero-tap SMS Retriever and iOS's
one-time-code keyboard suggestion — and what is live today versus what needs
provider-side setup.

Delivery failures are a separate concern from autofill: whether the SMS reached
the handset at all is covered in
[otp-delivery-audit.md](./otp-delivery-audit.md).

**Current state:** Supabase delegates SMS to **Twilio Verify**, which owns the
message body (the Supabase dashboard's SMS Template box does not apply). The
Verify service sends its default message — `Your SAMONA verification code is:
1234.` — so:

- **iOS autofill is live**: that phrasing is what iOS's one-time-code parser
  detects; the keyboard suggestion fills the boxes and auto-verify runs
  (confirm on a real device — see the matrix below).
- **Android zero-tap is dormant**: the Retriever only matches messages that
  contain the app hash, and the default message has none. Manual entry, paste
  and auto-verify are the Android path today. Turning zero-tap on later needs
  **no app changes** — see
  [Future upgrade: Android zero-tap](#future-upgrade-android-zero-tap-optional).

## How the flow works

```
phone screen                     verify screen
────────────                     ────────────
startOtpListening()   ──arm──►  (bus already listening)
sendCode()             ──SMS──►  SMS Retriever captures the body
router.push('/verify')          extractOtpCode() → 4 digits
                                boxes fill → auto-verify at 4 digits
                                success → root layout observes the session
```

(On Android today the capture step stays silent because the production SMS
carries no hash; every step after it is live and tested.)

- `startOtpListening()` arms Google Play Services' SMS Retriever **before**
  the OTP request leaves the phone screen, so the SMS can never beat the
  listener (`apps/*/src/app/(auth)/phone.tsx`).
- The listener is process-wide (`use-otp-autofill.ts` "bus"): it survives the
  phone → verify screen transition, caches the last SMS body, and re-arms
  after each SMS (so a resend is caught) and on Play Services' 5-minute
  timeout. `useOtpAutoFill()` subscribes to it and delivers the extracted
  code through its `onOtpReceived` callback.
- The verify screen fills the boxes and auto-verifies when exactly 4 digits
  are present. An in-flight lock (`verifyingRef`) plus a per-code lock
  (`lastAutoAttemptRef`) guarantee one request per distinct code — edits,
  re-renders and autofill re-deliveries never double-fire. Resend or editing
  the digits re-arms the locks; the Verify button always allows a manual
  retry. On success the root layout's auth observer routes into the app
  (unchanged session handling).
- Leaving the verify screen stops the listener (`stopOtpListening()`), and
  verifying successfully stops it too.
- iOS does not use the Retriever: `OtpInput` sets
  `textContentType="oneTimeCode"` and `autoComplete="one-time-code"`, so iOS
  offers the code from the SMS above the keyboard. Manual entry, paste and
  hardware keyboards keep working everywhere.

Android uses `autoComplete="sms-otp"` (its own valid hint), which pairs with
the Retriever rather than replacing it.

## The SMS message (Twilio Verify)

Supabase Auth owns the OTP lifecycle; the apps never send or store the code.
Both apps share one Supabase project, therefore one Twilio Verify Service SID
and one message body.

Twilio Verify resolves the message body in this order
([docs](https://www.twilio.com/docs/verify/verification-templates)):

1. a per-verification `TemplateSid`,
2. the service's `DefaultTemplateSid`,
3. the **Verify Default** — what is in use today:
   `Your {Service Friendly Name} verification code is: {code}`
   → `Your SAMONA verification code is: 1234.`

Notes:

- The Verify service's `code_length` is **4** — keep it that way; the UI and
  validation are built for exactly 4 digits.
- Twilio's pre-approved templates only support `{{friendly_name}}`,
  `{{code}}` and `{{ttl}}`, so they cannot carry the Android app hashes. That
  is why Android zero-tap needs a custom template (see the future upgrade
  below).
- Do **not** switch the Supabase provider to plain Twilio to regain the SMS
  Template box: Supabase's own OTPs are 6-digit and not configurable, which
  would break the 4-digit UI.

No OTP is written to logs: the verify screens log only the app hash, and
only in `__DEV__` Android builds.

## Future upgrade: Android zero-tap (optional)

The app side is complete and shipped; switching zero-tap on requires only
Twilio-side changes:

1. Request a **custom verification template** — Twilio grants these
   case-by-case via support:
   <https://help.twilio.com/hc/en-us/articles/9960174409627-Is-it-Possible-to-Customize-the-Verification-Message-for-Verify->
   Proposed body (one segment, `{{code}}` exactly once):

   ```
   Your SAMONA verification code is {{code}}.

   mqbDHIJEYKA
   lSIAglKzhjG
   ```

2. Once Twilio approves and creates the template, set it as the service's
   `DefaultTemplateSid`: Twilio Console → Verify → Services → (the service
   Supabase uses) → Settings → General → Template configuration (or the
   Services API).
3. From the next SMS, Android autofill starts working — **no app update, no
   Supabase change**.

**iOS domain-bound codes (optional, later):** appending
`@samona.in #{{code}}` as the last line makes the code domain-bound, and iOS
only suggests domain-bound codes when `samona.in` is one of the app's
associated domains
([Apple's rule](https://developer.apple.com/documentation/security/enabling-autofill-for-domain-bound-sms-codes)).
Ship that line only after all three pieces exist, or iOS may stop suggesting
the code entirely:

1. a custom template carrying the line (another Twilio request),
2. `expo.ios.associatedDomains: ["webcredentials:samona.in"]` in both
   `app.json`s **and an iOS rebuild** (native entitlement change),
3. `https://samona.in/.well-known/apple-app-site-association` served as JSON
   over HTTPS, no redirects:

   ```json
   { "webcredentials": { "apps": ["TEAMID.in.samona.customer", "TEAMID.in.samona.pro"] } }
   ```

   `TEAMID` is the 10-character team ID from Apple Developer → Membership;
   Apple's CDN picks the file up within ~24 h, and devices refresh on
   reinstall or weekly.

## App hashes

`hash = Base64(SHA-256("<applicationId> <hex(DER signing cert)>")).slice(0, 11)`
— Google's algorithm, identical to what `expo-otp-autofill`'s native
`AppHashHelper` computes at runtime (`getAppHash()` prints it in dev).

| App | Application ID | Keystore | Hash |
| --- | --- | --- | --- |
| Customer | `in.samona.customer` | `apps/customer/android/app/debug.keystore` | `mqbDHIJEYKA` |
| Pro | `in.samona.pro` | `apps/pro/android/app/debug.keystore` | `lSIAglKzhjG` |

Recompute with the committed script (needs `keytool` from a JDK):

```
node scripts/sms-retriever-hash.mjs
```

**Important:** both apps currently sign debug *and* release builds with the
committed `debug.keystore` (see each app's `android/app/build.gradle`). When
a real release keystore is introduced, rerun the script against it and update
the Twilio Verify template — a hash mismatch means Android silently drops the
autofill (manual entry keeps working).

## Packages and permissions

`expo-otp-autofill@1.1.0` was already installed in both apps — no new
packages were added. It wraps Google's SMS Retriever API, which requires
**no SMS permissions** (no `READ_SMS`, no `RECEIVE_SMS`; Play Services reads
the one matching SMS in its own process). The module is loaded lazily via
`require('expo-otp-autofill')` inside a try/catch because a static import
crashes environments without the compiled native side (Expo Go, iOS, Jest).

## Native build requirements

- The module is already wired into both apps' native projects, so **no new
  native build is required by this change** for existing installs.
- New clones / CI need the usual prebuild + dev build:
  `npx expo prebuild` (already checked in under `apps/*/android` and
  `apps/*/ios`) and a development build via `npx expo run:android`.
- **Expo Go does not include the native module** — Android autofill only
  works in dev builds and production builds. iOS autofill (keyboard
  suggestion) works in Expo Go too because it is pure `TextInput`
  configuration.
- Existing Firebase, Supabase and FCM native configuration is untouched.

## Test plan

Automated (Jest, both apps; see the test files listed in the PR):

- Extraction from provider SMS bodies (keyword, bare digits, wrong lengths).
- Bus: arm before send, cached-message freshness gate (nothing stale is
  filled), re-arm after a caught SMS and on timeout, stop on
  success/unmount, no-op off Android and without the native module.
- Verify screen: autofill fills the boxes; auto-verify fires exactly once
  per distinct code; edits and repeats never double-fire; manual Verify
  always works; resend clears the locks and re-arms; error copy renders.
- Phone screen: the retriever is armed before `sendCode` is called.
- Auth hook: network failures during verification show the
  connection-lost copy instead of "incorrect code".

Manual device matrix (Android needs a dev/production build, not Expo Go;
iOS needs a real device with a SIM — simulators cannot receive SMS):

| Scenario | Android customer | Android pro | iOS customer | iOS pro |
| --- | --- | --- | --- | --- |
| SMS autofill | dormant today (no hash in the default message); becomes zero-tap after the future upgrade | same | keyboard suggestion → tap → boxes fill → auto-verify | same |
| Manual entry | type 4 digits → auto-verify | same | same | same |
| Paste | paste 4 digits → auto-verify | same | same | same |
| Incorrect code | error copy, no auto refire, manual retry works | same | same | same |
| Expired/reused code | "incorrect code" copy | same | same | same |
| Resend | countdown 30s → new code → fill → auto-verify (fill is manual on Android today) | same | same | same |
| SMS never arrives | manual entry still works; timeout is silent | same | same | same |
| Slow network | spinner during verify; connection-lost copy on failure | same | same | same |
| Repeated attempts | one request per distinct code; Supabase rate limit copy after too many | same | same | same |
| Navigate away mid-listening | returning to phone → re-armed on next send; no stale fill | same | n/a (no Retriever) | n/a |
| Verify app hash | `adb logcat` in dev shows the hash matching this doc | same | n/a | n/a |

Optional emulator validation of the dormant Android plumbing (Google APIs
image with Play Services — injects the message the future template will
send, proving the whole chain works before the provider change):

```
adb logcat -s ReactNativeJS   # dev build prints "[verify] SMS Retriever app hash: mqbDHIJEYKA" / "lSIAglKzhjG"
adb emu sms send 15555218135 "Your SAMONA verification code is 4826. mqbDHIJEYKA"
```

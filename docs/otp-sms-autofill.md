# OTP SMS autofill (Android Retriever + iOS one-time-code)

Both apps sign in with a phone number and a 4-digit Supabase Auth OTP
(`OTP_LENGTH` in `packages/config/src/constants.ts`). This document covers how
the code fills itself in — Android's zero-tap SMS Retriever and iOS's
one-time-code keyboard suggestion — and everything that has to line up
outside the apps for it to work.

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

## The SMS template (Supabase dashboard)

Supabase Auth owns the OTP SMS; the apps never send or store the code. Both
apps share one Supabase project, so **one template must carry both Android
app hashes** — the Retriever only matches messages containing its own app's
hash, and each hash is harmless to the other app.

Set the template in the Supabase dashboard:
**Authentication → Phone Providers → SMS Template** (the message body):

```
Your SAMONA verification code is {{ .Code }}.

mqbDHIJEYKA
lSIAglKzhjG

@samona.in #{{ .Code }}
```

- `{{ .Code }}` is Supabase's Go-template variable for the 4-digit code.
- `mqbDHIJEYKA` is the customer app hash (`in.samona.customer`),
  `lSIAglKzhjG` is the pro app hash (`in.samona.pro`). On Android the hash
  may appear anywhere in the body; the extractor also tolerates keyword-less
  bodies, but "verification code is 1234" keeps extraction deterministic.
- `@samona.in #{{ .Code }}` on the **last line** is the iOS domain-bound
  format: with a verified domain association (Apple's associated domains for
  SMS one-time-codes — see "Remaining manual configuration" below), iOS
  parses `origin #code` and offers the code on the keyboard. Without the
  domain association it is inert text.
- Keep the total body within one SMS segment where possible (the template
  above is ~110 characters).

No OTP is written to logs: the verify screens log only the app hash, and
only in `__DEV__` Android builds.

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
the Supabase template — a hash mismatch means Android silently drops the
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

## Remaining manual configuration

1. **Supabase SMS template** (the step above) — the only backend change;
   nothing in the API server or the apps sends the OTP.
2. **iOS domain-bound autofill** (optional but recommended): submit the
   domain-association for `samona.in` in Apple's
   [SMS and Mail domain association](https://developer.apple.com/documentation/xcode/sms-and-mail-domain-association)
   (a `/.well-known/apple-app-site-association` entry listing both apps' team
   ID + App IDs). Without it the `@samona.in #1234` line is only inert text
   and users type/paste the code.

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

Manual device matrix (Android needs a dev/production build, not Expo Go):

| Scenario | Android customer | Android pro | iOS customer | iOS pro |
| --- | --- | --- | --- | --- |
| SMS autofill (zero-tap) | SMS lands → boxes fill → auto-verify | same | keyboard suggestion → tap → auto-verify | same |
| Manual entry | type 4 digits → auto-verify | same | same | same |
| Paste | paste 4 digits → auto-verify | same | same | same |
| Incorrect code | error copy, no auto refire, manual retry works | same | same | same |
| Expired/reused code | "incorrect code" copy | same | same | same |
| Resend | countdown 30s → new code autofills and verifies | same | same | same |
| SMS never arrives | manual entry still works; timeout is silent | same | same | same |
| Slow network | spinner during verify; connection-lost copy on failure | same | same | same |
| Repeated attempts | one request per distinct code; Supabase rate limit copy after too many | same | same | same |
| Navigate away mid-listening | returning to phone → re-armed on next send; no stale fill | same | n/a (no Retriever) | n/a |
| Verify app hash | `adb logcat` in dev shows the hash matching this doc | same | n/a | n/a |

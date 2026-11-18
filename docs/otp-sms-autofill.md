# OTP entry and autofill (iOS one-time-code + manual entry)

Both apps sign in with a phone number and a 4-digit Supabase Auth OTP
(`OTP_LENGTH` in `packages/config/src/constants.ts`). This document covers how
the code reaches the boxes and what auto-verifies it.

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
- **Android has no SMS autofill**: manual entry and paste are the path. The
  former SMS Retriever integration (`expo-otp-autofill`) was removed from both
  apps. Zero-tap would need a new native implementation plus the app hash in the
  message body; see [otp-delivery-audit.md](./otp-delivery-audit.md) for why
  that matters to delivery reports.

## How the flow works

```
phone screen                     verify screen
────────────                     ────────────
sendCode()          ──SMS──►     type / paste / iOS keyboard suggestion
router.push('/verify')           boxes fill → auto-verify at 4 digits
                                 success → root layout observes the session
```

- The verify screen auto-verifies when exactly 4 digits are present. An
  in-flight lock (`verifyingRef`) plus a per-code lock (`lastAutoAttemptRef`)
  guarantee one request per distinct code — edits and re-renders never
  double-fire. Resend or editing the digits re-arms the locks; the Verify
  button always allows a manual retry. On success the root layout's auth
  observer routes into the app.
- iOS uses `textContentType="oneTimeCode"` and `autoComplete="one-time-code"`
  on `OtpInput`, so iOS offers the code from the SMS above the keyboard. Manual
  entry, paste and hardware keyboards keep working everywhere. Android uses
  `autoComplete="sms-otp"` as its own valid input hint.

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
  `{{code}}` and `{{ttl}}`.
- Do **not** switch the Supabase provider to plain Twilio to regain the SMS
  Template box: Supabase's own OTPs are 6-digit and not configurable, which
  would break the 4-digit UI.

No OTP is written to logs.

**iOS domain-bound codes (optional, later):** appending
`@samona.in #{{code}}` as the last line makes the code domain-bound, and iOS
only suggests domain-bound codes when `samona.in` is one of the app's
associated domains
([Apple's rule](https://developer.apple.com/documentation/security/enabling-autofill-for-domain-bound-sms-codes)).
Ship that line only after all three pieces exist, or iOS may stop suggesting
the code entirely:

1. a custom template carrying the line (a Twilio support request),
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

## Test plan

Automated (Jest, both apps):

- Verify screen: auto-verify fires exactly once per distinct code; edits and
  repeats never double-fire; manual Verify always works; resend clears the
  locks and re-opens auto-verify; error copy renders.
- Phone screen: a valid number requests a code and navigates to verify; a
  double tap cannot send twice; validation errors stay on the screen.

Manual device matrix:

| Scenario | Android customer | Android pro | iOS customer | iOS pro |
| --- | --- | --- | --- | --- |
| Code entry | type / paste 4 digits → auto-verify | same | keyboard suggestion → tap → boxes fill → auto-verify | same |
| Incorrect code | error copy, no auto refire, manual retry works | same | same | same |
| Expired/reused code | "incorrect code" copy | same | same | same |
| Resend | countdown 30s → new code → fill → auto-verify | same | same | same |
| SMS never arrives | manual entry still works | same | same | same |
| Slow network | spinner during verify; connection-lost copy on failure | same | same | same |
| Repeated attempts | one request per distinct code; Supabase rate limit copy after too many | same | same | same |

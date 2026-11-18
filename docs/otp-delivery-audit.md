# OTP delivery audit: Supabase Auth → Twilio Verify

This document records what the phone sign-in flow actually does, what has been
verified in code, what has been implemented to make delivery failures
observable, and how to test and roll it out.

**Status:** instrumented, not diagnosed. No root cause is claimed here, because
the decisive evidence — Twilio's own per-message delivery events for the failing
handsets — did not exist before this change. The feature below exists to produce
that evidence. Treat every cause listed under "Candidates, not conclusions" as a
hypothesis until callback rows confirm it.

## Constraints this work honours

- Supabase Auth remains the only OTP issuer and verifier.
- Twilio Verify remains the only SMS sender; no second code is generated.
- No SMS permission is requested. Android OTP entry stays manual; iOS uses the
  one-time-code keyboard suggestion (see
  [otp-sms-autofill.md](./otp-sms-autofill.md)).
- OTP values are never stored or logged. Phone numbers are never logged, and are
  stored only as an HMAC.
- Existing sessions and sign-in behaviour are untouched; every telemetry call is
  best-effort.
- OTP length stays at 4 (`OTP_LENGTH`).

## The flow as it exists

```
 apps/pro|customer                   Supabase Auth                Twilio Verify
 ─────────────────                   ─────────────                ─────────────
 phone screen
   │  normalise number → E.164
   ├─ POST /auth/otp-attempts ──► SAMONA API  (telemetry only)          │
   │                                 │  store hashed attempt            │
   ├─ signInWithOtp({ phone }) ────► │ ──── verify request ───────────► │
   │                                 │                                ├─ SMS
   │                                 │                                │  (carrier)
   │                                 │ ◄──── status events ───────────┤
   │                                 │        webhook  ◄──────────────┘
   │                                 └─ POST /webhooks/twilio/verify
 verify screen
   ├─ verifyOtp({ phone, token }) ──► │
   └─ session → root layout routes into the app
```

The apps never see a Twilio `verification_sid`: Supabase owns the Verify call
and returns only its own session/OTP result. That is why attempt registration
and callback correlation are separate writes joined by phone hash and time.

## Verified findings (code evidence)

These are facts about the current implementation, established by reading it.

### F1 — There was no delivery evidence at all

Nothing recorded whether Twilio accepted, delivered, or dropped a message. The
only signals were "Supabase returned no error" and the user saying "no SMS".
`signInWithOtp` returning success means Verify accepted the request, not that a
handset received it.

### F2 — The client could send a malformed E.164 for India

Phone input kept only digits and capped at `maxLocalDigits`, but did not remove
the national trunk `0`. Typing or pasting `09876543210` produced
`+910987654321`. That string satisfies `phoneSchema`
(`/^\+[1-9]\d{7,14}$/`), so it was sent to Twilio as a different, generally
undeliverable number. This is a real defect independent of any carrier issue.

### F3 — Pasting a full number was truncated before normalisation

The `TextInput` also had `maxLength={country.maxLocalDigits}`. Android applies
that cap to the raw text before `onChangeText`, so pasting `+91 98765 43210`
handed JavaScript only the first 10 characters — dial code and spaces included.
The digits retained were wrong, and there was no way to recover the rest.

### F4 — Resend could be blocked by autofill arming (resolved)

`onResend` used to await an SMS-retriever arm without a guard. If that native
call rejected, the resend never ran and the screen surfaced no clear path
forward. The retriever integration (`expo-otp-autofill`) has since been removed
from both apps, so resend can no longer be blocked by it.

### F5 — Success semantics are easy to misread

`sendCode` returning `true` means Supabase accepted the request. Several
provider-side outcomes (carrier filtering, handset SMS-blocking, DND, invalid
destination) happen after that point. This is why user reports of "OTP not
received" can coexist with a clean Supabase response.

### F6 — Rate limiting existed only as copy

Supabase rate-limits sends and reports 429; the hook translates it to a retry
message. The client cannot tell a *provider* rate limit from a *carrier* one,
because that distinction only exists after Twilio has looked at the message. The
Twilio callbacks are the only place a send-side failure can be attributed.

### F7 — Android has no SMS autofill

Manual entry and paste are the Android path; the former SMS Retriever
integration was removed. A user who expects autofill may describe a successful
delivery as "nothing happened"; this is a UX confounder, not a delivery failure.
iOS one-time-code autofill is live.

### F8 — iQOO/Vivo behaviour cannot be inferred from the app

Nothing in the code branches on manufacturer. Any difference between an iQOO
handset and a Samsung on the same carrier is therefore outside the app: carrier
routing, the OEM SMS app's filtering/spam rules, dual-SIM selection, or DND.
The app can only record *which* handset asked, which is what the new telemetry
does.

## Candidates, not conclusions

These are the hypotheses the instrumentation is designed to separate. Each maps
to a distinguishable callback pattern.

| # | Candidate | Would look like |
|---|-----------|-----------------|
| C1 | Destination number malformed (trunk `0`) | No callback at all, or `undelivered` with an invalid-destination error |
| C2 | Twilio accepted, carrier filtered | `sent` then `undelivered`/`failed`, MCC/MNC shows the destination network |
| C3 | Handset/OEM SMS filtering (Vivo/iQOO spam rules, SIM inbox) | `delivered` from Twilio, user reports nothing; device model clusters |
| C4 | Wrong SIM / dual-SIM selection | `delivered` on the number Twilio was given; the user is reading another SIM |
| C5 | DND / sender-ID filtering in India | `undelivered` with carrier error, often consistent per circle/MCC-MNC |
| C6 | Supabase/Twilio throttling | Twilio event `failed` with a rate/queue error, or no attempt row and a 429 from Supabase |
| C7 | App-side send never happened | No attempt row at all for the reported time, and no Supabase send |

A mix is plausible. C1 and C3/C4 can both be true for different users.

## What was added

### Server: two tables, no PII

- `otp_attempts` — one row per code request. Stores `client_attempt_id`
  (idempotency), HMAC-SHA256 `phone_hash`, `phone_last2`, app (`PRO`/`CUSTOMER`),
  device manufacturer/model/OS, latest `status`, and Twilio SIDs once known.
- `otp_delivery_events` — one row per Twilio callback. Stores Twilio's event
  `id` (unique, idempotency), event type, status, `verification_sid`,
  `attempt_sid`, MCC/MNC, `number_segments`, event time, and the correlated
  attempt.

Phone hashing uses a server-only `OTP_PHONE_HASH_SECRET`. A plain SHA-256 of a
number is reversible by enumeration over the ~10^10 Indian mobile space; an HMAC
is not. The last two digits are kept separately so support can confirm "the
number ending 21" without a lookup key.

Migration: `server/prisma/migrations/20261117120000_add_otp_delivery_telemetry/`
(guarded, so re-running a partially applied migration is safe).

### Server: attempt registration

`POST /api/v1/auth/otp-attempts` (unauthenticated, write-rate-limited):

```json
{
  "phone": "+919876543210",
  "app": "pro",
  "clientAttemptId": "otp-m3k2-4f8a1c2d",
  "device": { "manufacturer": "vivo", "model": "I2202", "osVersion": "13" }
}
```

Returns `202 { "attemptId": "…" }`, or `202 { "attemptId": null }` when
telemetry is off. Registration is an upsert on `clientAttemptId`, so retries are
harmless.

### Server: Twilio callback

`POST /webhooks/twilio/verify`, mounted **before** `express.json()` so the raw
bytes survive.

Validation is local (`server/src/otp/twilio-signature.ts`):

1. the raw body must hash to the `bodySHA256` query value Twilio appended;
2. `X-Twilio-Signature` must equal HMAC-SHA1(auth token, exact signed URL).

The URL is rebuilt from the configured `TWILIO_WEBHOOK_URL` plus the received
query string — never from `Host`/`X-Forwarded-*`, which a proxy may rewrite.
A valid callback is answered `204`; duplicates are a no-op; genuine processing
errors propagate so Twilio retries rather than silently losing evidence.

Event types understood:
`com.twilio.accountsecurity.verify.message.{sent,delivered,read,undelivered,failed}`.

### Correlation

Because the client has no Verification SID, correlation is:

- same `phone_hash`;
- attempt `requested_at` within `OTP_CORRELATION_WINDOW_MS` (default 10 min)
  before the event, or up to 90 s after it (callbacks can beat the
  fire-and-forget registration);
- prefer attempts whose SID already agrees; otherwise nearest in time wins.

A callback that matches nothing is still stored with `otp_attempt_id = NULL`.
That is diagnostic, not an error: it means registration never arrived, or
telemetry was enabled after the request.

### Client

Both apps now:

- normalise input through `toLocalDigits()` in `src/utils/phone.ts`, which strips
  a pasted dial code and a national trunk `0` **before** the length cap, and no
  longer rely on `TextInput.maxLength` (so a pasted full number survives);
- register the attempt before `signInWithOtp`, fire-and-forget, with a 4 s
  timeout and `skipAuth: true`;
- log only the attempt id / HTTP status in development;
- resend no longer depends on any native autofill arm (the SMS Retriever
  integration was removed).

Telemetry is skipped when `NODE_ENV === 'test'` so hook tests stay hermetic.

### Admin: read-only view

The evidence is also viewable without SQL. Two admin-only endpoints sit behind
the existing `requireAdmin` middleware (session cookie or `x-admin-token`), so
no new role or permission is introduced:

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/admin/otp-attempts` | Paginated attempts with `app`, `status`, `device`, `phoneLast2`, `from`/`to` filters |
| `GET /api/v1/admin/otp-attempts/:id` | One attempt plus its delivery events, ordered by Twilio event time |

Both use the same `(requestedAt, id)` cursor as the bookings ledger and return
only privacy-safe DTOs: `phoneHash`, full numbers and OTP values are never
selected, and event ids are the internal ids rather than anything auth-related.
The response shape is `{ data, nextCursor }` for the list and `{ data }` for the
detail. `GET` only — there is no resend or mutation surface.

The dashboard screen is at `/dashboard/otp`, linked from the sidebar as
**OTP Delivery**, with a drill-down at `/dashboard/otp/:id`. Its filters mirror
the endpoints above. Telemetry being off simply yields an empty list; nothing
in the view can enable or change it.

## Enabling it

### 1. Create the secret

```bash
aws secretsmanager create-secret \
  --name samona/staging/otp-telemetry \
  --secret-string '{"TWILIO_AUTH_TOKEN":"…","OTP_PHONE_HASH_SECRET":"…"}'
```

Generate the hash secret with `openssl rand -hex 32`. Do **not** reuse the
Twilio auth token as the hash key.

### 2. Apply the migration

```bash
cd server
npx prisma migrate deploy    # staging/production RDS
```

PostgreSQL is the only supported database for these tables (the RDS instance),
so this is a normal Prisma migration.

### 3. Configure the API

Set on the API task (the CDK service stack does this when `otpTelemetry` is
passed):

```
OTP_TELEMETRY_ENABLED=true
TWILIO_WEBHOOK_URL=https://<api-host>/webhooks/twilio/verify   # no query string
TWILIO_AUTH_TOKEN=<from secret>
OTP_PHONE_HASH_SECRET=<from secret>
OTP_CORRELATION_WINDOW_MS=600000                               # optional
```

Enabling is all-or-nothing: if any of the three required values is missing the
API refuses to boot, because a half-configured webhook either accepts forged
callbacks or rejects every real one.

Deploy:

```bash
cd infra
npx cdk deploy SamonaStagingServiceStack \
  --context otpWebhookUrl=https://<api-host>/webhooks/twilio/verify \
  --context otpTelemetrySecretName=samona/staging/otp-telemetry
```

Equivalent environment variables (`TWILIO_WEBHOOK_URL`,
`OTP_TELEMETRY_SECRET_NAME`) work too. With neither, the stack deploys with
telemetry off and no secret reference.

### 4. Point Twilio at it

In the Twilio Console, configure the Verify **Message Status Stream** (Event
Streams webhook sink) for the Verify Service Supabase uses:

- destination: the same URL as `TWILIO_WEBHOOK_URL`;
- payload: JSON (the format this receiver validates);
- events: `com.twilio.accountsecurity.verify.message.*`.

Confirm the account auth token matches the one in Secrets Manager. Twilio's
console labels and sink setup vary; verify the subscription is active rather
than assuming the URL alone is enough.

### 5. Ship the apps

The client change is additive. Ship it before or with the backend; when
telemetry is off the endpoint still answers `202 { attemptId: null }`.

## Reading the evidence

Recent attempts with their latest status:

```sql
SELECT requested_at, app, device_manufacturer, device_model, os_version,
       phone_last2, status, verification_sid, attempt_sid, last_event_at
FROM otp_attempts
ORDER BY requested_at DESC
LIMIT 50;
```

Outcome split by device (the iQOO/Vivo question):

```sql
SELECT device_manufacturer, device_model, status, count(*)
FROM otp_attempts
WHERE requested_at > now() - interval '7 days'
GROUP BY 1, 2, 3
ORDER BY 4 DESC;
```

Failures by network:

```sql
SELECT e.status, e.mcc, e.mnc, count(*), min(e.event_time), max(e.event_time)
FROM otp_delivery_events e
WHERE e.event_time > now() - interval '7 days'
  AND e.status IN ('UNDELIVERED', 'FAILED')
GROUP BY 1, 2, 3
ORDER BY 4 DESC;
```

Events that matched no attempt (registration gap or late enablement):

```sql
SELECT count(*) FROM otp_delivery_events WHERE otp_attempt_id IS NULL;
```

Attempts with no events at all (request accepted, nothing reported back):

```sql
SELECT a.*
FROM otp_attempts a
LEFT JOIN otp_delivery_events e ON e.otp_attempt_id = a.id
WHERE a.requested_at > now() - interval '24 hours'
  AND e.id IS NULL;
```

The last query is the one that distinguishes "we never asked", "Twilio never
told us", and "Twilio told us and the network failed".

For the same views without SQL, open **OTP Delivery** in the admin dashboard
(`/dashboard/otp`). Filter by device, status, app, last two phone digits or date
range, then open an attempt to see its ordered Twilio events with MCC/MNC. See
"Admin: read-only view" above for the underlying endpoints and access rules.

## Device and carrier test plan

Run the same script on each combination, on a real SIM with the screen off and
then on, once on Wi-Fi and once on mobile data. Record the attempt id from the
dev log against the row that appears.

| # | Device | Network | What to record |
|---|--------|---------|----------------|
| 1 | iQOO (report the model) | Jio | attempt row, event timeline, status |
| 2 | iQOO | Airtel | same |
| 3 | Vivo (report the model) | Jio | same |
| 4 | Vivo | Airtel | same |
| 5 | Samsung (control) | Jio | same |
| 6 | Samsung | Airtel | same |

For each run:

1. Fresh install (or clear app data) so no session short-circuits the flow.
2. Enter the number in national form, then repeat via paste of `+91 …`; both
   must produce the same E.164 in the attempt row's `phone_last2` and no
   leading-zero variant.
3. Wait for the code. If it arrives, verify it. If it does not, wait 5 minutes,
   then resend once.
4. Note the OEM SMS app's spam/promotions folder and any "blocked" list.
5. Pull the attempt row and all events for that phone hash, with timestamps.

Interpretation:

- `DELIVERED` but the handset shows nothing → OEM filter/inbox or wrong SIM
  (C3/C4). Inspect the device, not the app.
- `UNDELIVERED`/`FAILED` with an MCC/MNC → carrier/route problem (C2/C5).
- `SENT` with no follow-up → Twilio saw no delivery receipt; still ambiguous
  between carrier hold and device state.
- No attempt row → the client never registered (C7); check connectivity and the
  API log, not Twilio.
- No event rows but an attempt row → webhook not subscribed, signature
  rejecting, or the API not deployed with telemetry on.

## Deployment and rollback

### Order

1. Apply the migration (additive; safe with the old server running).
2. Deploy the API with telemetry off, confirm health.
3. Enable telemetry (secret + env), confirm a synthetic callback is accepted or
   rejected *as expected*.
4. Configure the Twilio stream.
5. Ship the apps.

### Rollback

- Apps: the registration call is fire-and-forget, so shipping the previous build
  is safe; attempts simply stop being created.
- API: set `OTP_TELEMETRY_ENABLED=false` and redeploy, or deploy the previous
  image. The webhook then returns `503` and Twilio retries/drops per its policy;
  no sign-in path depends on it.
- Database: the tables are additive and unreferenced by auth. Leaving them in
  place is the safe default. Dropping them loses the evidence; do that only
  after exporting.
- Twilio: disable the Message Status Stream subscription to stop callbacks.

### What must not be rolled back together

Do not disable the webhook while leaving the Twilio subscription active *and*
assuming events are stored. During a rollback, events are intentionally not
persisted; note the gap in the investigation timeline.

## Privacy rules

- No OTP value is stored or logged anywhere, at any layer.
- No full phone number is logged. The database holds an HMAC and the last two
  digits; logs hold neither.
- Twilio payloads contain `to`, but it is hashed before any write and never
  logged.
- The hash secret is server-only. Losing it makes old hashes unusable for
  correlation; rotating it starts a new hash space (old rows remain, but cannot
  be joined to new ones).
- MCC/MNC, device model, and SIDs are not personal data in this context, but
  they are retained only as long as the investigation needs them. Decide a
  retention window before this becomes permanent infrastructure; the existing
  retention schedule is in [retention-schedule.md](./retention-schedule.md).

## Open questions to close with data

1. Does the iQOO/Vivo cluster show `delivered` or `undelivered`? That single
   split decides whether to chase the carrier or the handset.
2. Are failures concentrated on one MCC/MNC (one circle/operator)?
3. Do failed attempts share a device model more than a network?
4. How often is `bodySHA256` missing or the signature invalid in production
   (proxy/URL mismatch)? The 403 breadcrumb counts this without logging data.
5. How many attempts have no registration row? That is the client-side gap.

Until those are answered, this document deliberately stops short of naming a
root cause.

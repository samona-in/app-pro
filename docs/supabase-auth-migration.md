# Supabase Auth migration runbook

Moves SAMONA authentication off the restricted Supabase project
(`mbylupexffssmyiqgwnb`) onto a new one, **without losing user data**.

- **Old project:** `https://mbylupexffssmyiqgwnb.supabase.co` — under an
  org-wide Fair Use restriction (Storage cached egress), so it returns **402 on
  every Auth request**.
- **New project:** `https://tmjmjgjtnxfxhdmibiqh.supabase.co` (`ap-south-1`).
  JWKS verified: one **ES256** key at
  `https://tmjmjgjtnxfxhdmibiqh.supabase.co/auth/v1/.well-known/jwks.json`.
- **Users:** 29.
- **Topology (decided):** one Supabase project and one AWS API serve dev,
  preview and production together (the AWS infra is staging-only). So there is
  **one server and one project** to update.

The helper scripts live in
[`scripts/supabase-auth-migration/`](../scripts/supabase-auth-migration/README.md).

## What moves, what does not

Supabase is the **identity provider only**. Nothing else is affected:

| Concern | Hosted on | Impact |
|---|---|---|
| Phone OTP sign-in (all three surfaces) | Supabase Auth | **Moves to the new project** |
| Access-token verification (JWKS) | Supabase Auth | Repoint `SUPABASE_URL` |
| Account deletion (Admin API) | Supabase Auth | New service-role key |
| Database | AWS RDS | Unaffected |
| Files (selfies, job images, avatars, documents, banners) | AWS S3 | Unaffected |
| API | AWS Fargate | Only the Supabase env changes |

Because `profiles.id = auth.users.id`, every user is recreated on the new
project with the **same `id`** — so no re-key cascade touches jobs, earnings or
admin records. The identity list is read from the **source project's
`auth.users`** (the authoritative list, reachable over Postgres even while the
HTTP API is restricted); pass `--source profiles` to read the app database
instead.

## Why a hard cutover is safe

- `server/src/auth/token.ts` derives a single `issuer` from one `SUPABASE_URL`,
  so the server verifies tokens from exactly one project at a time. Apps and
  server move together — there is no dual-issuer window.
- The old project already returns **402**, so every installed build is already
  unable to get an OTP. The cutover costs nothing that has not already been lost.
- New project = new URL + new signing keys ⇒ old tokens/sessions are invalid ⇒
  **everyone signs in again once**. That is unavoidable and already true today.

---

## Phase 0 — Security (do this first)

A service-role key (`sb_secret_…`) was shared in plaintext during planning.
Treat it as compromised and rotate it **before** running anything:

1. Supabase Dashboard → **Project Settings → API** → rotate the secret key.
2. Put the new value only in `.env` as `SUPABASE_SERVICE_ROLE_KEY` and in AWS
   Secrets Manager (Phase 5). Never paste a secret in chat again.

(The publishable key is public by design — it ships inside the app bundle — so
it is safe in `.env` and in `NEXT_PUBLIC_`/`EXPO_PUBLIC_` variables.)

---

## Phase 1 — Configure the new project

The project already exists. Confirm its Auth config:

1. **Auth → Providers → Phone**: enabled.
2. **SMS provider: Twilio → Twilio Verify.** SAMONA uses a Twilio **Verify
   Service**, not plain Twilio Programmable Messaging. Copy the **same** three
   values the old project uses into the new project:
   - Twilio **Account SID**
   - Twilio **Auth Token**
   - Twilio **Verify Service SID**
3. Leave the Verify service's **code length at 4** — the apps' UI and validation
   are built for exactly four digits (`packages/config/src/constants.ts`).
4. **Do not switch the Supabase provider to plain Twilio.** Supabase's own OTPs
   are 6 digits and not configurable, which would break the 4-digit UI. See
   [`docs/otp-sms-autofill.md`](./otp-sms-autofill.md).
5. Because it is the **same** Verify service, the message body is unchanged
   (`Your SAMONA verification code is: 1234.`) and **iOS autofill keeps working
   with no app change**. Android OTP entry stays manual (the SMS Retriever
   integration was removed from both apps).
6. **Auth → Rate limits**: match the old project's OTP request limits.
7. **Storage**: create **no public buckets**. The whole incident was cached
   egress on legacy public buckets; the app serves files from S3.
8. Leave the project's asymmetric signing as-is. Confirm JWKS lists keys, and
   keep `SUPABASE_JWT_SECRET=""` and `SUPABASE_JWKS_URL=""` (derived).

**Test before migrating anyone:** from a real device, request an OTP through a
temporary client pointing at the new URL + publishable key and confirm the SMS
arrives and verifies. Do this before Phase 3.

---

## Phase 2 — Export the identity list (read-only)

```bash
node scripts/supabase-auth-migration/export-users.mjs
```

Reads the source project's `auth.users` (default) and writes `.state/users.json`
(gitignored — it holds PII). Use `--source profiles` to read the app database
instead. Expect **29** identities. Investigate any "duplicate phone" warnings
before continuing.

---

## Phase 3 — Recreate users on the new project

First, update `.env` so the scripts point at the new project:

```dotenv
SUPABASE_URL="https://tmjmjgjtnxfxhdmibiqh.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<the rotated sb_secret_… value>"
```

Then dry-run, then execute:

```bash
node scripts/supabase-auth-migration/recreate-users.mjs            # dry run: classifies all 29
node scripts/supabase-auth-migration/recreate-users.mjs --execute  # creates them
```

Expect `created: 29`, `conflicts: 0`. The dry run prints the destination host —
confirm it is `tmjmjgjtnxfxhdmibiqh.supabase.co` (the script refuses the old
project unless `--force`). Re-running is safe and resumable.

## Phase 4 — Verify

```bash
node scripts/supabase-auth-migration/verify-users.mjs
```

Must end with `Verification OK`. Non-zero exit means users are missing — re-run
Phase 3 (`--execute`) and verify again.

---

## Phase 5 — Server + infra (AWS staging, account `072842665972`)

The API task gets `SUPABASE_URL` from CDK context/`.env` and the service-role
key from Secrets Manager. Both must change together.

1. **Rotate the service-role secret** (Phase 0 value):
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id samona/staging/supabase-service-role \
     --secret-string "<the rotated sb_secret_… value>" \
     --region us-east-1
   ```

2. **Redeploy the service stack.** `infra/bin/samona-staging.ts` reads
   `SUPABASE_URL` from `.env`, so the change in Phase 3 is picked up here. This
   rewrites the task definition, which restarts the task and pulls the new
   secret at the same time:
   ```bash
   cd infra
   npx cdk deploy SamonaStagingServiceStack
   ```

   If for any reason no new task starts, force one:
   ```bash
   CLUSTER=$(aws ecs list-clusters --region us-east-1 \
     --query 'clusterArns[]' --output text | tr '\t' '\n' | grep SamonaStagingServiceStack | head -1)
   SERVICE=$(aws ecs list-services --cluster "$CLUSTER" --region us-east-1 \
     --query 'serviceArns[0]' --output text)
   aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
     --force-new-deployment --region us-east-1
   ```

3. **Verify the API:**
   ```bash
   curl -s https://<alb-dns>/api/v1/health
   ```
   Then make one authenticated call with a fresh token from the new project to
   prove JWKS verification works.

---

## Phase 6 — Apps (rebuild required)

`EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` values are **inlined at build time**, so this
needs new builds, not just a config edit.

### Pro (`apps/pro`)

- **EAS env vars** for **both** `preview` and `production` (the environments in
  `apps/pro/eas.json`), or the EAS dashboard → Project → Environment variables:
  ```
  EXPO_PUBLIC_SUPABASE_URL=https://tmjmjgjtnxfxhdmibiqh.supabase.co
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_vJWTqV1EmKu7HdylOXl__w_orXirfDc
  ```
  CLI form (visibility `plaintext`, these are public):
  ```bash
  eas env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_URL --value https://tmjmjgjtnxfxhdmibiqh.supabase.co --visibility plaintext
  eas env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_vJWTqV1EmKu7HdylOXl__w_orXirfDc --visibility plaintext
  eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://tmjmjgjtnxfxhdmibiqh.supabase.co --visibility plaintext
  eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_vJWTqV1EmKu7HdylOXl__w_orXirfDc --visibility plaintext
  ```
- **Local dev:** set the same two values in `apps/pro/.env`, then restart Expo
  with `--clear` (the old value is cached in the Metro transform cache).
- **Rebuild:** `eas build` for `preview` and `production`.

### Customer (`apps/customer`)

Same as Pro, using `apps/customer/eas.json` and `apps/customer/.env`.

### Admin (`apps/admin`, Next.js on Vercel)

- **Vercel** → project → Settings → Environment Variables, for **Production**
  and **Preview**:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://tmjmjgjtnxfxhdmibiqh.supabase.co
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_vJWTqV1EmKu7HdylOXl__w_orXirfDc
  ```
- Redeploy. Local dev: the same two values in `apps/admin/.env.local`.
- `admin.samona.in` is already in `CORS_ORIGINS`; no server change is needed.

---

## Phase 7 — End-to-end test matrix

Run every row before declaring the cutover done:

| Test | Expected |
|---|---|
| New user requests OTP (Pro, fresh phone) | SMS arrives, 4-digit code verifies, profile created |
| **Existing** user requests OTP (Pro) | Signs in; `profiles.id` unchanged; jobs/earnings intact |
| Customer app OTP | Signs in |
| Admin OTP (`admin.samona.in`) | Signs in; `admin_session` cookie minted |
| Authenticated API call | Succeeds (proves JWKS verification against the new project) |
| FULL_ACCOUNT self-deletion | Admin API `DELETE_AUTH` succeeds with the new service-role key |
| iOS autofill | Keyboard suggests the code (unchanged Verify service) |

---

## Phase 8 — Cleanup and rollback

**Keep the old project** until the cutover is signed off.

- Once confident, in the old project: make the legacy Storage buckets private or
  delete them (`services`, and any leftover `pro-selfies` / `job-images` /
  `avatars`), and confirm no rows point at Supabase Storage
  (`scripts/service-images-migration/sql/04-verify.sql`). The old project's
  restriction lifts by itself at the next billing cycle regardless.
- Clean the hardcoded Supabase Storage URLs in `docs/mockups/**/preview.html`.

**Rollback** (only if the new project is wrong): revert `SUPABASE_URL` in
`.env`, revert `SUPABASE_SERVICE_ROLE_KEY` in Secrets Manager, revert the app
env vars, and redeploy/re-ship. The old project is left intact for exactly this.

---

## Variable reference

| Variable | Where | New value |
|---|---|---|
| `SUPABASE_URL` | `.env` (server + CDK) | `https://tmjmjgjtnxfxhdmibiqh.supabase.co` |
| `SUPABASE_JWKS_URL` | `.env` (server) | `""` (derived) |
| `SUPABASE_JWT_SECRET` | `.env` (server) | `""` (asymmetric project) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` + Secrets Manager | rotated `sb_secret_…` |
| `EXPO_PUBLIC_SUPABASE_URL` | Pro, Customer (EAS + local `.env`) | new URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pro, Customer | `sb_publishable_vJWTqV1EmKu7HdylOXl__w_orXirfDc` |
| `NEXT_PUBLIC_SUPABASE_URL` | Admin (Vercel + `.env.local`) | new URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Admin | `sb_publishable_vJWTqV1EmKu7HdylOXl__w_orXirfDc` |

## Gotchas

- **SMS is Twilio Verify, per project.** The Verify service is shared (same SID),
  so the message body and 4-digit length are unchanged — but the **SMS
  credentials must be configured on the new Supabase project**, and Twilio bills
  per OTP (provider-side, independent of Supabase's plan).
- **Free projects pause after ~1 week of inactivity.** Fine while you are
  actively testing; if the environment goes quiet, open the dashboard.
- **Do not create public Storage buckets** on the new project.
- **Old builds are already dead** (the old project returns 402), so there is no
  "keep both working" option — ship the new builds promptly.

# Supabase Auth migration: identity export → recreate → verify

Moves the SAMONA identities off the restricted Supabase project
(`mbylupexffssmyiqgwnb`) onto the new project
(`https://tmjmjgjtnxfxhdmibiqh.supabase.co`) **without losing any user data**.

The key idea: `profiles.id` equals `auth.users.id`, so the user list does not
have to be read from Supabase at all. It comes from RDS, and every user is
recreated on the new project with the **same `id`**. Because the id is
preserved, `profiles.id` still matches after the cutover and no re-key cascade
touches jobs, earnings or admin records.

> If a user is somehow missed, the server's `syncUser` still adopts the account
> **by verified phone** on first sign-in and re-keys `profiles.id` with
> `ON UPDATE CASCADE`. Preserving ids just makes that safety net unnecessary.

The full cutover runbook — Supabase, server, apps, verification and rollback —
is in [`docs/supabase-auth-migration.md`](../../docs/supabase-auth-migration.md).

## Prerequisites

- Node.js 20+ (the repo already requires 20.19+).
- `DATABASE_URL` in `.env`, pointing at the RDS `profiles` table (read-only use).
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`, pointing at the
  **new** project. The service-role key is server-only: never commit it, never
  paste it in chat, never put it behind an `EXPO_PUBLIC_`/`NEXT_PUBLIC_` prefix.

The scripts read `.env` themselves (`env.mjs`), so anything already exported in
your shell wins and nothing is echoed to a log.

## 1. Export (read-only)

```bash
node scripts/supabase-auth-migration/export-users.mjs
```

Writes `.state/users.json` (gitignored — it contains phone numbers and emails):

```sql
SELECT id, phone, email, "fullName", "createdAt"
FROM profiles
WHERE deleted_at IS NULL AND phone IS NOT NULL
ORDER BY "createdAt";
```

The quoted camelCase columns (`"fullName"`, `"createdAt"`) are the ones Prisma
does **not** remap; only `is_admin` and `deleted_at` carry `@map`.

Flags: `--out <path>`, `--include-deleted`, `--database-url <url>`, `--no-ssl`.
Console output is masked (`••••1234`). Duplicate or missing phone numbers are
reported as warnings.

## 2. Recreate (dry run, then execute)

Dry run is the default. It lists the destination users and classifies every
source user — nothing is created.

```bash
node scripts/supabase-auth-migration/recreate-users.mjs          # dry run
node scripts/supabase-auth-migration/recreate-users.mjs --execute
```

Each user is created via `POST /auth/v1/admin/users` with:

```json
{ "id": "<preserved uuid>", "phone": "+91…", "phone_confirm": true }
```

plus `email` / `email_confirm: true` and `user_metadata.full_name` when the
profile has them. Phone-only users have no password to migrate.

Classification, in order:

| Existing match | Action |
|---|---|
| Same `id` | `already-exists` (success; skipped on resume) |
| Same `phone`, different `id` | `conflict` — reported, not silently re-linked |
| No match | `created` |

Behaviour that makes interruption safe:

- State is saved after every user in `.state/state.json`; re-running the same
  command resumes (successes are skipped). `--fresh` archives the old state.
- Creates retry with exponential backoff on 408/429/5xx.
- `--limit N` processes the first N users; `--concurrency N` (default 2, max 8)
  bounds parallel creates.
- A guard refuses to run against the old restricted project unless `--force`.

Outputs: `.state/recreate-report.md` / `.json`, `.state/recreate.log`.

## 3. Verify

```bash
node scripts/supabase-auth-migration/verify-users.mjs
```

Lists every destination user and compares by id and by phone against the
export. Exits non-zero if any source user is missing, so it can gate the
cutover. `--json` prints the full report.

## Credentials

The service-role key is read from `SUPABASE_SERVICE_ROLE_KEY` (or
`--service-key`) and sent only to the destination project's Admin API as both
`apikey` and `Authorization`. It is never logged, written to state, or included
in a report.

**If a service-role key was ever shared in chat or a ticket, rotate it** before
running these scripts: Supabase Dashboard → Project Settings → API → rotate the
secret key, then update `.env` and the AWS secret.

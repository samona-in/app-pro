# SAMONA Pro — current progress

Working notes for picking the project back up. Not committed (see `.gitignore`);
this is scratch context, not documentation. The committed docs are
[README.md](README.md) and [CLAUDE.md](CLAUDE.md).

_Last updated: 2026-08-22_

---

## ⚠️ Read this first: `main` is missing the onboarding work

PR #8 merged into `feat/supabase-phone-auth`, but PR #7 had **already** merged
that branch into `main` before #8 landed on it. So:

| Branch | Has auth (#7) | Has onboarding (#8) |
| --- | --- | --- |
| `main` | ✅ | ❌ |
| `feat/supabase-phone-auth` | ✅ | ✅ |

`main` is **39 files / +2,305 lines behind**. It has no `(onboarding)` screens,
no `pros` API, one migration instead of two, and no `rls-check.sql`.

**Fix:** open and merge a PR from `feat/supabase-phone-auth` → `main`.

This is the second time this has happened (it hit #2/#3 earlier and needed PR #5
to repair). The cause is mixing two integration models — see
[Process](#process-decide-this) below.

---

## Where things stand

**Built and verified:** monorepo scaffold, Express API organised by domain,
rate limiting and abuse protections, Supabase phone-OTP auth, identity/pro
profile split, resumable 8-step onboarding, RLS.

**93 tests passing** (17 mobile, 76 server). Lint, typecheck, build, format,
e2e, `expo-doctor` 21/21 and an Android bundle all green on
`feat/supabase-phone-auth`.

### Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Mobile | Expo SDK 57, Expo Router, NativeWind | Tailwind pinned **3.4.x** (NativeWind 4 needs `~3`) |
| State | TanStack Query + Zustand | Query owns server state; Zustand client-only |
| API | Node + Express 5 | No DI container; `context.ts` composes explicitly |
| DB | Supabase Postgres + Prisma 7 | Pooled URL at runtime, `DIRECT_URL` for migrations |
| Auth | Supabase Auth, phone OTP via Twilio Verify | JWKS (ES256) verified locally |
| Style | **No classes anywhere** | Enforced by `no-restricted-syntax` |

### Identity model

```
auth.users.id  ──trigger──▶  public.profiles.id       (same UUID)
                             public.pro_profiles.user_id  (unique FK)
```

`profiles.id` **is** `auth.users.id` — no second identity system. Completion
lives in one place: `isProProfileComplete` in `@samona/types`, imported by both
API and app.

---

## Environment

`.env` (root) and `apps/pro/.env` are gitignored and populated locally.

| Value | State |
| --- | --- |
| Supabase URL / JWKS | ✅ set — project `ecncpwrwckskotzhyuyt`, ES256 |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ set |
| `SUPABASE_SECRET_KEY` | ✅ set — **rotate it**, it was pasted into a chat |
| `DATABASE_URL` / `DIRECT_URL` | ⚠️ still pointing at localhost, not Supabase |
| `SUPABASE_JWT_SECRET` | correctly empty (project uses asymmetric keys) |

---

## Next steps

1. **Merge `feat/supabase-phone-auth` → `main`.** Nothing else should start
   until `main` is whole.
2. **Point `DATABASE_URL`/`DIRECT_URL` at Supabase** and run
   `npm run prisma:migrate -w @samona/server`. Migrations have never run against
   a real database.
3. **Run `server/prisma/checks/rls-check.sql` against Supabase.** RLS was
   verified against stock Postgres with a stubbed `auth` schema — Supabase may
   grant `authenticated` more than the stub models.
4. **Set the OTP length to 4 in Twilio Verify** to match `OTP_LENGTH`.
5. **Walk the flow on a device**: new number → OTP → onboarding → home;
   returning number → straight to home; quit mid-onboarding → resumes.
6. Rotate the Supabase secret key.

Then: job state machine and matching, the two remaining backend domains
(`files`, `admin`), CI running `npm run verify`.

---

## Deferred deliberately

- Avatar upload (step 7 collects bio and languages only)
- Documents, payout details, certifications — schema takes them without
  touching auth
- `SIGNUP_DEFAULT_ROLE` assigns `PRO` globally; needs an explicit verified
  signup step before the customer app exists
- `syncUser` costs a query per authenticated request — worth caching
- `ON DELETE CASCADE` from `profiles` to `auth.users` is wrong once jobs and
  payments reference it
- Dark mode (app is light-only)
- Invalid/expired OTP paths are handled but only hand-tested

---

## Gotchas already paid for

Things that cost real debugging time. Don't rediscover them.

- **Run Expo from `apps/pro`, never the repo root.** The root now fails with a
  helpful message instead of the cryptic `Unable to resolve "../../App"`.
- **`--clear` after changing any `EXPO_PUBLIC_*`.** Metro caches the inlined
  value; the app will silently use the old one.
- **RLS column privileges must be an allow-list.** `REVOKE UPDATE (col)` does
  nothing against a table-level grant. The first version let a Pro set their own
  `is_verified` and `role = ADMIN`. `rls-check.sql` guards this.
- **`jose` pinned to 5.x** — v6 is ESM-only and breaks the CJS server and Jest.
- **Jest pinned to 29**, RNTL to 13 — required by the RN preset; 14 returned no
  queries from `render()`.
- **`clerkMiddleware` needed a publishable key server-side** (Clerk era, now
  removed — noted only in case Clerk returns).
- **Empty optional env values fail `z.url()`** — `.env.example` ships `FOO=""`,
  now treated as unset.
- **`tsBuildInfo` must live inside `dist/`**, or deleting `dist/` leaves
  `tsc -b` believing it is up to date and emitting nothing.
- **Auth route guards, not imperative navigation.** Verifying an OTP created the
  session but left the user on the verify screen, so a success looked like
  "token expired" on the second tap.

---

## Process: decide this

`main` has now fallen behind twice because the repo mixes two models. Pick one:

- **Trunk-based** — point every PR at `main`, retire the long-lived feature
  branch. Simplest, and the gap cannot recur.
- **Integration branch** — keep stacking on one branch and merge it to `main` at
  each milestone, never merging it to `main` mid-stack.

Doing both is what produced the gap, both times.

---

## PR history

| PR | State | Merged into | What |
| --- | --- | --- | --- |
| #1 | merged | `main` | Monorepo scaffold (NestJS at the time) |
| #2 | merged | feature branch | NestJS → Node + Express |
| #3 | merged | feature branch | Removed all classes |
| #4 | merged | feature branch | Rate limiting + abuse protections |
| #5 | merged | `main` | Repaired the first `main` gap |
| #6 | **closed** | — | Clerk auth (abandoned for Supabase) |
| #7 | merged | `main` | Supabase phone auth |
| #8 | merged | `feat/supabase-phone-auth` | Auth + onboarding ⚠️ **not on `main`** |

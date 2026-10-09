# Permanent Account Deletion — Retention Decision Record

Deleting an account is a marketplace problem, not a row problem. A job has two
owners; chat has two parties; a rating belongs to one account but describes
another. This document records exactly what SAMONA Pro's account deletion keeps
and removes, and why. It is written for review — legal and product — so the
guarantees here are the contract reviewers should check against local law.

## What deletion means

Deletion is server-driven, irreversible, and scoped to one account:

- **PRO_PROFILE** — the account is also a customer (one phone, both surfaces,
  Rapido-style). Removing the pro surface only: the professional profile, its
  documents and its objects are gone forever; the customer surface and the
  Supabase Auth identity keep working.
- **FULL_ACCOUNT** — the account has no customer surface. The pro surface is
  removed *and* the Supabase Auth identity is deleted, so the number can be
  re-registered as a brand-new account. (When both surfaces exist, a
  full-account option is intentionally not offered from the Pro app.)

## The rule of thumb

A row belongs to the pro if it exists *only because* that pro registered.
A row is kept if deleting it would damage someone else's record or deniable
history.

| Data | PRO_PROFILE | FULL_ACCOUNT |
| --- | --- | --- |
| `ProProfile` row | **Kept** (tombstone) | **Kept** (tombstone) |
| Profile PII (name, phone, email) | Kept (customer identity) | **Removed** |
| Pro services/skills/document rows | **Deleted** | **Deleted** |
| Job-alert notifications (pro-scoped) | **Deleted** | **Deleted** |
| Job offers & declines (pro-scoped) | **Deleted** | **Deleted** |
| Jobs (as pro or customer) | **Kept** | **Kept** |
| Job status history | **Kept** | **Kept** |
| Chat messages | **Kept** | **Kept** |
| Pro selfie / document objects (S3) | **Purged** | **Purged** |
| `AccountDeletion` record | **Kept** (audit) | **Kept** (audit) |

## Why the tombstone (not a hard delete)

The professional's jobs, reviews, chat and earnings are *the customer's*
financial and safety record. If the pro row vanished, `Job.proId` would dangle
and every historical job, rating and message thread would lose "who did this"
forever. So the `ProProfile` row stays for the life of the marketplace with:

- `deletedAt` set
- display name, gender, bio, experience level, location, languages,
  selfie path, push fields, verification — all nulled
- `isOnline = false` (matching excludes it), `isVerified = false`

What remains is an id + a timestamp: the answer to "who worked this job" with
no PII attached. The customer surface renders this as **"Deleted Professional"**
in active jobs and chat.

The `Profile` row (the shared identity) is tombstoned only in FULL_ACCOUNT;
PRO_PROFILE leaves it untouched because the customer surface still needs a live
identity.

## Locking the foreign keys

As a belt-and-braces guard (tombstones are never hard-deleted today, so these
constraints exist to make *future* forks safe), the schema forbids what a
deletion-adjacent bug could otherwise do:

- `Job.proId` → `Restrict` (a job must always name a pro)
- `Message.senderId` → `Restrict` (a message must always name a sender)

## What is NOT deleted when the pro is gone

- **Jobs** — the customer's proof of service, price, time and pro identity.
- **JobStatusHistory** — audit trail of that job.
- **Messages** — the conversation; the customer may need it.
- **Ratings/reviews** — reviews describe the pro's *performance*, and even the
  governing regulations that let professionals erase personal data generally
  keep performance-of-service records.
- **Photos in `jobs/{customerId}/`** — object storage for the job, owned by the
  customer's booking, not the pro's profile.

This is why "delete my account" removes the pro surface and its own objects but
cannot be allowed to pull the jobs, chat or reviews with it.

## Timing and states

- Work in flight: deletion is **not** reversible once accepted, but it is
  **deferred** while the pro has jobs in `ACCEPTED`, `TRAVELLING`, `ARRIVED` or
  `IN_PROGRESS`. The pro keeps finishing; matching, offers and new accepts are
  stopped the instant deletion is accepted (`isOnline=false`,
  `deletionRequestedAt=[now]`).
- `COMPLETED` and `PAYMENT_PENDING` jobs do **not** block. They are delivered,
  locked-down outcomes; waiting on them would strand an otherwise-finished
  deletion, and their financial rows survive regardless.
- Finalization runs its steps (`LOCK → PURGE_S3 → PURGE_DB → DELETE_AUTH →
  FINALIZE`) idempotently, recording each finished step so a crash resumes from
  the last completed step. A step that keeps failing past the attempt ceiling
  lands in `FAILED` — terminal, surfaced in the app as "contact support", and
  never auto-retried.

## Identity and the `auth.users` row

- FULL_ACCOUNT deletes the Supabase Auth identity via the Admin API using the
  server's service-role key. The key is never in a client or a log.
- The `Profile` row is tombstoned in the same flow. `syncUser` treats a
  tombstoned row as no-account, so a deleted identity can never be resurrected
  by re-presenting an old access token, and re-registering the number builds a
  fresh identity.
- PRO_PROFILE never touches Supabase Auth — the phone re-signs in and lands on
  the surviving customer surface.

## Objects (S3)

Pro-owned objects under `pros/{userId}/` (selfie, avatar, documents) are removed
in all scopes. Job images live under `jobs/{customerUserId}/` and survive.

The purge is **hold-aware**, not an unconditional prefix delete. When an active
legal hold protects a submitted document, that object and the `ProDocument` row
that names it survive while everything else the pro owned is still purged. When
a hold protects the profile itself (`PROFILE`/`PRO_PROFILE`), every object and
reference the profile owns is preserved. A hold therefore narrows the purge; it
never stalls the deletion, and the profiles step still completes. Because the
S3 step runs before the DB step, the row naming a held object is never dropped
before its object is protected.

## Legal holds (retention engine)

A legal hold is a service-level record (`LegalHold`) with a holder type, a
reason, an authorizing operator and an optional expiry. There is no admin REST
route for it: only backend operations create or release holds, so an operator
cannot accidentally mutate a hold from a client. Holder types are `PROFILE`,
`PRO_PROFILE`, `DOCUMENT`, `JOB`, `CUSTOMER_PROFILE` and `OTHER`.

A hold is live while `active = true` and it is either open-ended or not yet
expired. Account deletion and the retention sweep both consult the same service,
so a held artifact is skipped identically in both.

## Automatic retention cleanup

The retention engine ages out a small, explicitly-approved set of records on a
schedule. It is **off by default**, in dry-run by default, and gated three ways
before anything is deleted: the global enable flag, the per-category flag, and
an approved period. Hardware rules:

- Six categories are **report-only** and can never be deleted automatically,
  even if an operator misconfigures the flag and period: customer avatars,
  the account-deletion audit, saved addresses, chat messages, completed jobs
  and cancelled jobs. These are another party's record or the historical record
  the marketplace exists to keep.
- A file is always deleted from storage **before** the row that names it, so a
  failed object delete leaves the durable reference for the next sweep.
- Orphaned job-image objects are only touched when no job references them and
  they are older than a safety window, and the reference set is rebuilt
  immediately before deletion.
- An actual sweep takes a Redis lock and **fails closed** if the lock cannot be
  acquired. A dry-run takes no lock and writes nothing at all — not even an
  audit row.

## What needs review

1. **Ratings retention** — kept forever, attached to a tombstone. Confirm this
   against the applicable personal-data framework; several regimes exempt
   professional performance records, but the product team should sign off.
2. **Chat retention** — full message history is kept to protect the customer.
   Legally, the pro's own messages may still be considered their personal data;
   the countervailing rationale is that the thread is not their data alone.
3. **`AccountDeletion` row** — kept as an audit record of the deletion event
   (who, when, scope). By design not purged.
4. **No payment/earnings model yet** — when Settlement lands, this decision
   record must be extended: financial rows for customers survive; the "pro's
   own ledger" question has not been answered here.
5. **Retention periods** — no deletion period is set in code. Each category's
   period (pro documents, selfies, pro avatars, job images, pro/customer
   notifications, pro services & skills, declines & offers) needs a recorded
   product/legal decision before its enable flag and period are set together.
   Promoting a report-only category out of that set is likewise a reviewed
   decision, not a config change. The proposed periods, their anchors, legal
   drivers and the sign-off table live in `docs/retention-schedule.md`.

## Handling a FAILED deletion

A deletion stuck in `FAILED` leaves the pro locked out (they can still sign in,
but `isOnline` is false and re-authorization is refused) and the pro surface
half-cleared. This is the "manual attention" path: support verifies the failing
step (usually S3 or the Auth admin call), clears it, and either retries or, if
permanent, completes the purge by hand. It is never retried automatically past
the ceiling because an automated retry loop against a permanently-failing
external call is worse than a pager.
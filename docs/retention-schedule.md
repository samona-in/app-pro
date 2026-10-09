# Automatic Retention Schedule — Proposal for Product/Legal Sign-off

**Status: PROPOSED.** No period below is active. The retention engine is disabled
and dry-run by default; a category deletes only when the global flag, its
per-category flag and an approved period are all set
(`server/src/retention/policy.ts`). This document is the record reviewers sign
against. It is a companion to `docs/account-deletion-retention.md` (review item
5) and is referenced from `.env.example`.

> This is an engineering recommendation, not legal advice. Periods, anchors and
> the legal drivers must be confirmed by counsel for each jurisdiction SAMONA
> operates in. The working assumption is India / Digital Personal Data
> Protection Act, 2023 (DPDP), under which personal data is erased once the
> purpose is served **unless** a law requires longer retention. Where a legal
> driver is marked *unconfirmed*, retention must not be enabled until counsel
> rules.

## How the gate works

A sweep deletes nothing until **all three** are true:

1. `RETENTION_CLEANUP_ENABLED=true` (global, off),
2. `RETENTION_CATEGORY_<CAT>_ENABLED=true` (off), and
3. `RETENTION_DAYS_<CAT>` is a positive number (unset).

An unset period means "never delete automatically" regardless of flags
(`policy.ts` `canDeleteCategory`). Six categories are additionally **report-only**
and are stripped of deletion eligibility even if all three are set: customer
avatars, the account-deletion audit, saved addresses, chat messages, completed
jobs and cancelled jobs.

## What the clock measures (anchors)

The period is only meaningful with its anchor. These are the anchors the code
implements today:

| Category | Anchor (when the clock starts) |
| --- | --- |
| `proDocuments` | `ProProfile.deletedAt` — account deletion |
| `selfies` | `ProProfile.deletedAt` — account deletion |
| `proServicesSkills` | `ProProfile.deletedAt` — account deletion |
| `avatarsPro` | S3 object `LastModified`, for a tombstoned pro only |
| `jobImages` | S3 object `LastModified`, for objects no job references |
| `notificationsPro` | `Notification.createdAt` |
| `customerNotifications` | `CustomerNotification.createdAt` |
| `jobDeclinesOffers` | `JobDecline.createdAt` / `JobOffer.createdAt` |

Account-derived records (`proDocuments`, `selfies`) were re-anchored on
`deletedAt` so the schedule reads "N days **after deletion**". Before that change
they anchored on the row's own timestamp, which would purge an old document the
instant an account closed — exactly when a fraud or dispute window needs it.

## Proposed schedule (deletable categories)

| Category | Data | Proposed | Range considered | Why this value | Legal driver |
| --- | --- | --- | --- | --- | --- |
| `proDocuments` | Identity/verification documents | **1825 days (5 yr)** after deletion | 2–5 yr | Identity fraud and licensing disputes surface years later; 5 yr mirrors the common KYC record benchmark. Drop to 2–3 yr if counsel finds no retention duty. | KYC record-keeping benchmark (*unconfirmed for gig marketplace*) |
| `selfies` | Liveness self-photo | **90 days** after deletion | 30–180 d | Biometric-adjacent; purpose ends when verification and the account are closed. | DPDP data minimisation |
| `avatarsPro` | Pro profile photo | **30 days** | 7–90 d | Cosmetic; the tombstone nulls the reference, so nothing downstream needs it. | DPDP data minimisation |
| `jobImages` | Orphaned job photos (no job row) | **90 days** | 30–180 d | No durable reference exists; the window guards against a booking committing its reference at the same time. | DPDP data minimisation |
| `notificationsPro` | Pro push/in-app notifications | **90 days** | 30–180 d | Ephemeral comms; no downstream consumer. | DPDP data minimisation |
| `customerNotifications` | Customer-surface notifications | **90 days** | 30–180 d | Ephemeral comms; no downstream consumer. | DPDP data minimisation |
| `proServicesSkills` | Service/skill links of a deleted pro | **30 days** after deletion | 7–90 d | Directory metadata of a tombstone; nothing references it once the profile is gone. | DPDP data minimisation |
| `jobDeclinesOffers` | Stale offers/declines for non-active jobs | **180 days** | 90–365 d | Bounded window for matching/fairness review; non-active jobs only. | Internal integrity; DPDP minimisation |

## Report-only categories (period must stay unset)

These are another party's record or the historical record the marketplace exists
to keep. They are counted for visibility and never deleted.

| Category | Data | Why kept |
| --- | --- | --- |
| `avatarsCustomer` | Customer avatars | Another party's image; not ours to erase on a pro timer. |
| `accountDeletionAudit` | `AccountDeletion` audit row | Proof the deletion happened, with scope and time. |
| `savedAddresses` | Customer saved addresses | Customer's own data, unrelated to the pro lifecycle. |
| `messages` | Chat messages | Two-party record; the customer may need it. |
| `jobsCompleted` | Completed/paid jobs | Financial and service record. |
| `jobsCancelled` | Cancelled/expired jobs | Dispute and integrity record. |

Promoting any of these out of report-only is a reviewed product/legal decision,
not a config change.

## Recommended configuration (after sign-off)

Set the period and the flag together; never set a period without a recorded
decision. Exact values, ready to paste once approved:

```
RETENTION_CLEANUP_ENABLED="true"
RETENTION_DRY_RUN_DEFAULT="true"          # keep dry-run on for the first cycles

RETENTION_CATEGORY_PRO_DOCUMENTS_ENABLED="true"
RETENTION_DAYS_PRO_DOCUMENTS="1825"

RETENTION_CATEGORY_SELFIES_ENABLED="true"
RETENTION_DAYS_SELFIES="90"

RETENTION_CATEGORY_AVATARS_PRO_ENABLED="true"
RETENTION_DAYS_AVATARS_PRO="30"

RETENTION_CATEGORY_JOB_IMAGES_ENABLED="true"
RETENTION_DAYS_JOB_IMAGES="90"

RETENTION_CATEGORY_NOTIFICATIONS_PRO_ENABLED="true"
RETENTION_DAYS_NOTIFICATIONS_PRO="90"

RETENTION_CATEGORY_CUSTOMER_NOTIFICATIONS_ENABLED="true"
RETENTION_DAYS_CUSTOMER_NOTIFICATIONS="90"

RETENTION_CATEGORY_PRO_SERVICES_SKILLS_ENABLED="true"
RETENTION_DAYS_PRO_SERVICES_SKILLS="30"

RETENTION_CATEGORY_JOB_DECLINES_OFFERS_ENABLED="true"
RETENTION_DAYS_JOB_DECLINES_OFFERS="180"
```

Recommended roll-out: enable one category at a time, run at least one dry-run
cycle with `RETENTION_DRY_RUN_DEFAULT="true"`, inspect the report
(`npm run retention:dry-run --workspace @samona/server`), then flip that one
category to a commit sweep before moving on.

## Open decisions required before enabling

1. **Jurisdiction & legal basis** — confirm DPDP applies as assumed, and whether
   any local law mandates a minimum retention for identity documents.
2. **`proDocuments` period** — 5 yr vs a shorter minimization period; decide
   once (1) is answered.
3. **Ratings, chat, earnings** — out of scope here; see
   `docs/account-deletion-retention.md` items 1–4.
4. **Report-only set** — confirm no category should move.

## Sign-off

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Product | _pending_ | | |
| Legal / compliance counsel | _pending_ | | |
| Engineering | _pending_ | | |

Signed periods are recorded here and mirrored in `.env` per environment. A
change to any period after sign-off requires a new row, not an edit.

## Change log

| Date | Change |
| --- | --- |
| 2026-10-09 | Initial proposal; anchors standardised on account deletion for account-derived records. |

# Feature: Pro-released jobs return to the open pool

## Summary

When a pro cancels (releases) a job from `ACCEPTED`, `TRAVELLING`, or `ARRIVED`, the job returns to `REQUESTED` and is re-offered to eligible pros. Customer-initiated cancellation from these states remains `CANCELLED` (permanent).

## Design Decisions

| Decision | Choice |
|---|---|
| Which states re-offer | `ACCEPTED`, `TRAVELLING`, `ARRIVED` (all pre-work) |
| Expiry reset | Fresh `jobExpireTtlMs` window from re-release |
| Chat messages | Cleared when job returns to pool |
| Releasing pro | Excluded via `JobDecline`; cannot re-grab |
| Re-alert cooldown | `JOB_ALERT_REARM_COOLDOWN_MS` — default 5 min |
| Customer notice | "Finding a new professional" (not "Booking cancelled") |

---

## Changes

### 1. State machine — `packages/types/src/job.ts`

Add `REQUESTED` to transition lists for pre-work states:

```ts
ACCEPTED:   [TRAVELLING, REQUESTED, CANCELLED],
TRAVELLING: [ARRIVED,    REQUESTED, CANCELLED],
ARRIVED:    [IN_PROGRESS, REQUESTED, CANCELLED],
```

### 2. `cancelJob` split — `server/src/jobs/jobs.service.ts`

- Gate: `!actorIsCustomer && canTransition(row.status, REQUESTED)` → `releaseJobToPool()`
- Customer path unchanged (→ `CANCELLED`)
- IN_PROGRESS lockout unchanged

**`releaseJobToPool` transaction:**
- `job.updateMany` atomic guard (prevents concurrent race) →
  `status: REQUESTED, proId: null, acceptedAt: null, agreedPayPaise: null, finalPayPaise: null, verificationOtp: null, otpIssuedAt: null, startOtpAttempts: 0, cancelledAt: null, completedAt: null, expiresAt: now + ttl`
- `jobStatusHistory.create`: `row.status → REQUESTED`
- `jobDecline.upsert` for releasing pro (excludes from feed + re-accept)
- `message.deleteMany({ where: { jobId } })` — clears chat

**Fan-out:**
- `JOB_STATUS` to releasing pro + customer (open REQUESTED)
- `matching.findEligiblePros(...)` → exclude releaser → `JOB_NEW` + `reAlertEligiblePros(..., cooldown)`
- Customer notice: "Finding a new professional"
- Skip `resolveJobAlerts` (already resolved at accept)
- Keep freed-pro re-nudge (`notifyReadyJobRequests`)

### 3. Re-alert cooldown — `server/src/notifications/notifications.service.ts`

- **New config** `JOB_ALERT_REARM_COOLDOWN_MS` (5 min default, 30s–1h)
- `upsertAlert`: add `rearm` flag → `resolvedAt: null` on update, bump `repeats`
- `reAlertEligiblePros(recipients, info, cooldownMs)`:
  - Fresh pros (no prior alert) → immediate push + upsert
  - Cooled-down pros (`now - updatedAt >= cooldownMs`) → re-arm + push
  - Within cooldown → skip (no push)
- Uses `Notification.updatedAt` as last-alerted timestamp

### 4. Expiry reset — `server/src/jobs/jobs.service.ts`

- `toJobDto:207` — prefer stored `row.expiresAt` when set; fall back to `createdAt + ttl`
- `expireStaleJobs:1579` — sweep uses `expiresAt` for released jobs, `createdAt` for fresh

### 5. Harden `claimOpenJob` — `server/src/jobs/jobs.service.ts:924`

- Add `declines: { none: { proId } }` to the atomic `updateMany` Where clause
- Add same filter to pre-read `findFirst` for clear conflict message
- Prevents re-grab by released/declined pro; covers both accept paths

---

## Tests

- `jobs.service.spec.ts`: update release test, add RELEASED at ACCEPTED/TRAVELLING, claimOpenJob decline guard
- `notifications.service.spec.ts`: re-arm cooldown tests (fresh/cooled-down/within-cooldown)
- Config fixtures: add `jobAlertRearmCooldownMs` to test configs and e2e specs
- Run `tsc`, ESLint, jest

---

## Follow-ups (not in scope)

- Customer app UI showing "Finding a new professional" state
- Admin dashboard exposing released-vs-cancelled metrics

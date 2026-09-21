# Plan: Pro Job Pool (replaces Past Jobs / Job History)

## Objective

Replace the Pro app's **Past Jobs / Job History** surface with a live **Job Pool**:

- A browsable list of *only* the currently available open jobs the signed-in pro is
  eligible to take (server-derived services, location/radius, onboarding, not busy).
- Accept via the existing atomic claim flow; no Decline on the pool.
- Kept synchronized via existing realtime events — a job disappears from every
  relevant pool the moment it is claimed, cancelled or expired.
- The orphaned Past Jobs / Job History surface (app screen + `GET /jobs/history`) is
  removed on both app and server.

## Decisions

- **Data:** reuse `GET /jobs/available` → `listAvailableJobs`, strengthened to enforce
  the full matching eligibility predicate so *pool ≈ offers*.
- **Gating:** pool is visible only while the pro is online (matches how offers behave
  and how the current screen gate works).
- **Actions:** Accept only (reuses `offerActions.accept` → atomic `claimOpenJob`).
- **History:** `GET /jobs/history`, `listJobHistory`, `useJobHistory`, query key and
  related tests are removed.

## Server changes — `server/src/jobs/`

### 1. Eligibility-gate `listAvailableJobs` (`jobs.service.ts`)

- Keep the current DB prefilter: `REQUESTED`, `proId: null`, `serviceId in myServices`,
  `declines: { none: { proId } }`.
- After fetching candidates, skip rows lacking job or pro coordinates; for the rest run
  `matching.isProEligible(pro.id, { serviceId, latitude, longitude })` (checks: online,
  onboarding COMPLETED, has coords, no active job, within `serviceRadiusKm`).
- Surface only eligible jobs, ordered distance-first (nearest first) via `distanceKm`,
  mirroring `matching.findEligiblePros` and the incoming-jobs screen ordering.
- Return the existing `AvailableJob[]` DTO unchanged. Empty `serviceIds` or no pro
  coordinates → `[]`.

### 2. Real-time drop of open jobs on customer cancel (`cancelJob`)

- Today an *unassigned* open job cancelled by the customer emits `JOB_STATUS` only to
  the customer, so pros' pools can hold a stale job until the next refetch.
- After the transaction + `resolveJobAlerts`, query the `JOB_ALERT` holders for the job
  and emit to them `JOB_STATUS` with the cancelled pro-detail and `cancelledBy:
  'customer'` (mirroring `expireStaleJobs`).
- App-side safety already exists: `use-job-cancellation` ignores the event when
  `acceptedAt == null` (no vibration/redirect for people who never accepted);
  `use-incoming-offers` drops the terminal offer; `useRealtimeSync` invalidates the
  jobs cache so pools refresh.

### 3. Remove job history

- Delete `listJobHistory` and its export from `jobs.service.ts`.
- Delete the `GET /jobs/history` route in `jobs.routes.ts` and its block + `listJobHistory`
  mock in `jobs.routes.spec.ts`.
- `paginationSchema` remains (still used by `/available`).

## Pro app changes — `apps/pro/src/`

- `services/jobs.ts`: replace `history()` with `available(options)` →
  `api.get<AvailableJob[]>('/jobs/available', { query: options })`.
- `constants/query-keys.ts`: drop `history`, add `available: ['jobs','available']`.
- `hooks/use-jobs.ts`: drop `useJobHistory`; add `useJobPool` (key `jobs.available`,
  `staleTime` ~15s).
- `hooks/use-realtime.ts`: also invalidate `jobs.all` on `job:offer:ended` so declines
  made elsewhere (offers tab / native overlay) refresh an open pool.
- `utils/job-errors.ts` (new): shared accept-error→message mapping extracted from
  `incoming-jobs.tsx`; reused by both surfaces.
- `components/jobs/JobPoolCard.tsx` (new): service name + category (`skill`/`customSkill`),
  `formatInr(basePayPaise)`, distance badge + ETA, `locationLabel`, truncated
  `description`, Accept (success) button with per-job busy state and inline error.
- `app/jobs.tsx`: rewrite as **Job Pool** — keep auth/onboarding redirects and the online
  gate ("Go online to see jobs"); `useJobPool()`; loading/error/empty states; a FlatList
  of `JobPoolCard`; Accept = `offerActions.accept(jobId)` → on success
  `refetchQueries(jobs.all)` and route via `occupiedJobRoute`; on failure show the mapped
  error and drop that job from the pool.
- `app/(tabs)/home.tsx`: keep the briefcase → `/jobs` entry (label "Jobs"); refresh the
  stale "no browse-available-jobs marketplace" comment.

## Tests

- `jobs.service.spec.ts`: rewrite the `listAvailableJobs` describe to mock
  `matching.isProEligible` and assert eligible jobs surface, ineligible / offline-pro /
  no-coords return empty, and distance-first ordering. Add a `cancelJob` case that
  asserts `JOB_STATUS` is emitted to open-alert holders for an unassigned job.
- `jobs.routes.spec.ts`: remove the `/history` test and its `listJobHistory` mock; keep
  `/available`.
- `offer-actions.test.ts` and the app `routes.test.ts` are unaffected; run the suites to
  confirm.

## Out of scope

- No Decline action on pool cards; no new `/pro/job-pool` route; offers/incoming-jobs,
  native overlay, and push flows unchanged. No Prisma schema change → no migration.

## Verification

- Server: `npm run typecheck --workspace @samona/server`, `npm test --workspace
  @samona/server`, eslint.
- App: `npm run typecheck --workspace @samona/pro`, `npm test --workspace @samona/pro`,
  eslint.

## Git workflow

- Branch `feature/pro-job-pool`.
- Commits:
  1. `feat(api): gate available jobs by matching eligibility`
  2. `feat(jobs): drop open jobs from pros' pools on cancellation`
  3. `feat(pro): replace past jobs screen with a live job pool`
  4. `refactor(api): remove the past-jobs history endpoint`
- PR: Summary / Why / Implementation / Testing / Screenshots (pool list, empty, offline)
  / Risks / Follow-ups. No self-merge.
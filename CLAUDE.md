# SAMONA Pro Engineering Instructions

These instructions govern all work in this repository. Follow them for every task unless
explicitly instructed otherwise by the user.

## Product Context

SAMONA is an on-demand marketplace connecting customers with local skilled professionals.

SAMONA Pro is the professional-side application.

Professionals use the app to:

- Create and manage their profile
- Select services and skills
- Set availability
- Go online/offline
- Receive nearby job requests
- Accept or decline jobs
- Navigate to customers
- Update job status
- Complete jobs
- View earnings
- Manage their profile
- Receive notifications
- Build their reputation

The customer application will be built later and will use the same backend.

## Technology

Mobile:

- React Native
- Expo
- Expo Router
- TypeScript
- NativeWind
- Zustand
- TanStack Query
- Expo Notifications
- Expo Location
- Expo Secure Store
- Expo Image Picker
- Expo Haptics

Backend:

- Node.js
- TypeScript
- Express
- PostgreSQL (hosted on Supabase)
- Supabase Auth
- Prisma
- Redis
- Socket.IO
- REST API
- WebSocket events for realtime functionality

Use current stable versions compatible with each other.

Do not introduce additional libraries unless they solve a real requirement.

## Architecture

Use a production-oriented monorepo.

Recommended structure:

```
apps/
  pro/
  customer/        # reserved for future implementation

server/

packages/
  api-client/
  types/
  config/
  validation/
```

The architecture must support adding the customer app without restructuring the backend.

Keep domain logic separated.

Backend modules should be organized by business domain:

- auth
- users
- pros
- customers
- services
- jobs
- matching
- locations
- payments
- earnings
- notifications
- reviews
- files
- admin

Do not organize the backend into giant generic folders such as:

```
controllers/
services/
models/
```

Instead, keep related route/service/schema files inside their domain.

## React Native Architecture

Use Expo Router.

Separate:

- screens/routes
- components
- hooks
- stores
- API services
- types
- utilities
- constants

Do not put business logic directly inside screen components.

Use reusable components.

Use TanStack Query for server state.

Use Zustand only for client/application state.

Do not duplicate server state in Zustand.

## API

Create a typed API client shared by mobile applications.

API requests must have:

- consistent error handling
- typed request/response models
- authentication handling
- timeout handling where appropriate

Never hardcode API URLs.

Use environment variables.

## Authentication

Authentication must be designed so the same authentication system can support:

- Customer
- Pro
- Admin

Do not create separate authentication systems for each application.

Role-based authorization must happen on the backend.

Never trust role information sent by the client.

Supabase Auth is the identity provider. Phone number with SMS code is the
sign-in method for professionals.

- Supabase owns credentials and phone verification. No password, OTP or
  credential is ever sent to, stored by, or logged by this codebase.
- The `User` row is the authority on `role`. Never read a role from a token
  claim, a header or a request body. Supabase allows custom claims, and a claim
  we do not issue ourselves is not a basis for authorization.
- `User.id` equals `auth.users.id`. Sharing the key keeps the join implicit, so
  anything holding a Supabase identity and anything holding a SAMONA profile
  agree without a join table.
- Verify access tokens locally against the project's JWKS. Calling the Auth API
  per request would add a round trip and tie our availability to theirs.
- Users are provisioned just-in-time on first authenticated request. Everything
  needed is already in the verified token, so provisioning costs one query.
- Never manage the `auth` schema from our migrations. It belongs to Supabase.

PostgreSQL runs on AWS RDS. Prisma remains the data access layer; the Supabase
client is used in the app for authentication only, never to query domain tables,
because this API is the single place authorization is enforced. No pooler sits in
front of it today, so `DATABASE_URL` and `DIRECT_URL` are the same endpoint and
`DIRECT_URL` is optional.

`schema.prisma` is the only source of truth for database structure. The database
carries no row-level security: every protected route authorizes its own request,
and the database is not reachable by clients. If a table ever needs an RLS
policy, that is a design decision, not a default.

The migration history is a single baseline in `server/prisma/migrations/`. The
31-migration chain it replaced lives in `server/prisma/migrations-supabase/` and
must never be run — it references `auth.users`, the Supabase `authenticated`
role and the Supabase Storage bucket catalogue, none of which exist on RDS. It is
kept as a record, and `prisma.config.ts` points at `migrations/` only, so
nothing in the archive can be applied by accident.

Two things the baseline had to carry by hand, because `schema.prisma` cannot
express them. When squashing or rewriting migrations, check for both:

- **Reference data.** The services and skills catalogue is `INSERT` rows in the
  baseline SQL, not part of the datamodel. A regeneration from `schema.prisma`
  alone produces a schema with no services, and the app cannot onboard anyone.
- **Data backfills** are for existing rows and are meaningless on an empty
  database.

After changing `schema.prisma`, verify the baseline still matches rather than
trusting it:

```
npm run prisma:deploy --workspace @samona/server   # against an empty database
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

The second command must print "This is an empty migration". Set `DIRECT_URL` as
well as `DATABASE_URL` if a root `.env` exists, because `prisma.config.ts`
prefers `DIRECT_URL` and the root `.env` is loaded into the environment.

File storage is AWS S3. Uploads are presigned PUTs issued by this API; the bytes
never pass through a JSON body here. The S3 client carries no credentials in the
environment — it resolves them from the ambient provider chain, which on Fargate
is the task role.

S3 has no bucket-level `file_size_limit` the way Supabase Storage did, so the
storage service re-checks object size on `HEAD` before a domain records the
object. Sizing has to be enforced where the record is written, or it is not
enforced at all.

Public object URLs resolve one origin per bucket, each falling back to its own
regional S3 URL when unset. Not one shared base URL: a CDN distribution fronts a
single bucket, so selfies, job images and avatars each need their own host. Set
them independently — that is what lets a bucket move to CloudFront without the
other two following it.

## Job State Machine

Jobs must use explicit states.

Initial states:

```
REQUESTED
OFFERED
ACCEPTED
TRAVELLING
ARRIVED
IN_PROGRESS
COMPLETED
PAYMENT_PENDING
PAID
CANCELLED
EXPIRED
```

Do not change job status arbitrarily from the frontend.

The backend must validate allowed state transitions.

## Location

Location is a core feature.

The Pro application needs to support:

- Current location
- Service radius
- Online/offline availability
- Location updates
- Nearby job matching

Do not request background location permissions unless the feature actually requires them.

Explain why a permission is required before requesting it.

## Realtime

Use Socket.IO for realtime events where appropriate.

Examples:

- New job request
- Job accepted
- Job cancelled
- Job status update
- Customer/pro location updates
- Earnings/payment events where appropriate

REST should remain the source of truth for persistent state.

WebSockets should not replace the database.

## Database

Use PostgreSQL with Prisma.

Database models should be normalized and designed around the marketplace.

At minimum expect entities such as:

- User
- ProProfile
- CustomerProfile
- Service
- Skill
- ProSkill
- Job
- JobStatusHistory
- Location
- Payment
- Earning
- Review
- Notification
- Document

Use migrations.

Never manually modify the production database schema without a migration.

## Validation

Validate input on both:

1. Client
2. Server

Server validation is authoritative.

Use a consistent schema validation approach.

## Error Handling

Never silently swallow errors.

Return consistent API errors.

Do not expose internal stack traces, database errors, secrets, or infrastructure
information to clients.

Log useful server-side errors.

## Security

Never commit:

- API keys
- secrets
- tokens
- passwords
- private certificates
- production credentials
- .env files containing secrets

Use `.env.example` for documentation.

Validate authorization on every protected backend route.

Never trust:

- user IDs
- roles
- prices
- job ownership
- location claims

provided by clients without server validation.

## Abuse Prevention

Every public endpoint must be rate limited. An unlimited endpoint is an
invitation.

Use the shared limiters in `server/src/common/middleware/rate-limit.ts`; do not
invent per-route limits ad hoc. Pick the tier that matches the cost of the
operation:

- `auth` — credential endpoints (sign-in, OTP request/verify, password reset)
- `write` — state-changing domain routes
- `expensive` — anything that costs money: payments, geocoding, uploads
- `location` — high-frequency telemetry
- `global` — the baseline applied to everything in `app.ts`

Rate limiting alone is not enough for credentials. Rate limits are keyed by
caller; a password-spray attack uses many callers against one account. Pair
them with the per-identity lockout in `common/security/brute-force.ts`, which is
keyed by the account being targeted.

Rate limit counters must live in Redis, never in process memory, or an attacker
multiplies their allowance by the number of running instances.

Never key a limiter on a value the client controls. `X-Forwarded-For` is
client-supplied unless a trusted proxy overwrote it — trust exactly the number
of proxy hops you actually run.

Reject bad requests as early and as cheaply as possible. Validation runs after
the body is parsed, so size, content-type and shape limits must come first.

Compare secrets, tokens and OTPs with `safeEqual`, never `===`.

Never let a security control fail open silently. If Redis is unavailable, fall
back to a degraded limiter and log it loudly; do not disable protection.

Client-side throttling is a courtesy to the server, never a control. Assume
every client is hostile and enforce the real limit on the backend.

## Code Quality

Prefer simple, readable code.

Avoid premature abstraction.

Avoid giant components.

Avoid duplicated logic.

Avoid unnecessary dependencies.

Use strict TypeScript.

Do not use `any` unless there is a documented reason.

Use meaningful names.

Keep functions small and focused.

Write functional code. Do not declare classes anywhere in this codebase.

- Use factory functions that return an object, with private state held in the
  closure, instead of classes and instances.
- Use function components and hooks in React Native. Never class components.
- Build errors with `new Error()` and attach fields, paired with a type guard
  (`isApiError`, `isHttpError`). Do not subclass `Error`; `instanceof` on a
  custom error type will not work.
- Compose dependencies explicitly by passing them as arguments. Do not
  introduce a DI container or decorators.

Calling a constructor from a third-party or built-in API (`new Error()`,
`PrismaClient`, `Redis`, `AbortController`) is fine — the rule is about the
code we write. `no-restricted-syntax` enforces this in ESLint.

## UI

SAMONA Pro should feel like a premium consumer application.

It should NOT look like:

- an admin dashboard
- a generic CRUD application
- a basic React Native template

The UI should prioritize:

- clear hierarchy
- fast interactions
- large important information
- accessible touch targets
- useful motion
- haptic feedback where appropriate
- excellent loading states
- empty states
- error states
- offline states

The most important Pro actions are:

```
ONLINE/OFFLINE
NEW JOB
ACCEPT
NAVIGATE
ARRIVED
START JOB
COMPLETE JOB
EARNINGS
```

These actions must be visually obvious.

## Git Workflow

Git discipline is mandatory.

Before starting work:

1. Inspect git status.
2. Inspect the current branch.
3. Inspect recent commits.
4. Never overwrite or discard existing user changes.
5. Never reset or force-push unless explicitly instructed.

Never work directly on main for feature development.

Create a focused feature branch.

Branch naming:

```
feature/<short-name>
fix/<short-name>
refactor/<short-name>
chore/<short-name>
```

Examples:

```
feature/pro-onboarding
feature/pro-job-flow
feature/pro-earnings
fix/job-status-transition
```

## Commit Rules

Every logical change must have a focused commit.

Use Conventional Commits.

Examples:

```
feat(pro): add professional onboarding
feat(pro): add online availability toggle
feat(api): add job request endpoint
feat(jobs): implement job state transitions
fix(auth): handle expired sessions
refactor(api): extract typed client
```

Do not create meaningless commits such as:

- update
- changes
- stuff
- final
- fixes
- work

A commit should describe exactly what changed.

## Pull Requests

After completing each logical feature/change:

1. Run relevant tests.
2. Run TypeScript checks.
3. Run linting.
4. Run formatting if configured.
5. Review the git diff.
6. Commit the change.
7. Push the branch.
8. Create a pull request.

Do not create a PR for every tiny one-line change.

A PR should represent one coherent logical change.

Every PR must include:

### Summary

What changed.

### Why

Why the change was needed.

### Implementation

Important technical details.

### Testing

Commands that were run and their results.

### Screenshots

Required for UI changes where practical.

### Risks

Potential regressions or areas that need review.

### Follow-ups

Anything intentionally left for a future PR.

PR titles should follow Conventional Commit style when practical.

Example:

```
feat(pro): build professional onboarding flow
```

## After Every Change

After making a change:

- inspect git diff
- verify files changed are expected
- run relevant tests
- commit
- push
- open/update the PR

Do not leave completed work uncommitted.

Do not leave completed work only in the working tree.

## PR Safety

Never merge your own PR automatically.

Never delete branches unless explicitly instructed.

Never force push.

Never rewrite published history.

If there are unrelated existing changes in the working tree, do not include them in your
commit.

## Testing

At minimum, run appropriate checks before opening a PR.

Mobile:

- TypeScript
- ESLint
- tests where available
- Expo validation/build checks where appropriate

Backend:

- TypeScript
- ESLint
- unit tests
- integration tests where available

Do not claim tests passed unless they were actually run.

## Documentation

When adding a new architectural pattern, document it.

Keep README and CLAUDE.md accurate.

Do not add unnecessary documentation for trivial implementation details.

## Deployment (staging)

The staging environment is defined as a CDK app in `infra/` and deployed to
`072842665972` / `us-east-1`. See `infra/README.md` for the full sequence; the
shape that matters when changing it:

- **Two stacks, deployed in order.** `SamonaStagingStack` creates the VPC, RDS,
  Redis, S3, ECR and secrets. The image is then built and pushed. Then
  `SamonaStagingServiceStack` creates the ALB, cluster, and the single Fargate
  task. The order is real: ECS cannot pull an image that does not exist, and the
  ECR repository cannot exist until the first stack deploys.
- **Handoffs via SSM (`/samona/staging/…`), never CloudFormation exports.**
  Exports are cross-stack references and removing one deadlocks a deployment in
  `UPDATE_ROLLBACK_FAILED`. Also: unknown values must be split before they are
  published (one parameter key per subnet), never inside the consumer — an SSM
  read is an unresolved token at synth, so a string operation on it yields the
  whole value, not the part.
- **One task, no autoscaling.** Socket.IO uses the in-memory adapter and
  `setInterval` schedulers; a second task would drop realtime events and
  double-fire jobs. `minHealthyPercent: 0` keeps a deploy from briefly running
  two. The image tag is mutable, so pushing a new `latest` requires
  `aws ecs update-service --force-new-deployment` to re-pull it.
- **URLs are composed in the container, never stored.** `server/docker-entrypoint.mjs`
  assembles `DATABASE_URL`/`REDIS_URL` from endpoint env vars and Secrets
  Manager values injected as `DB_SECRET`, `REDIS_AUTH_TOKEN` and runs either the
  server (`SAMONA_START=server`, default) or `prisma migrate deploy`
  (`SAMONA_START=migrate`, the `:migrate` image). `SAMONA_LOG_URLS=1` logs the
  URLs with passwords redacted.
- **RDS TLS from Node.** RDS certificates chain to an AWS CA that is not in
  Node's built-in trust store; `NODE_EXTRA_CA_CERTS` points at the RDS CA bundle
  baked into the image at build time. Without it the Prisma driver adapter (and
  any Node TLS client) fails with `self-signed certificate in certificate
  chain`, even though `sslmode=require` is set. `prisma migrate deploy` is not a
  reliable canary for this: its native engine does not use Node's trust store.

## Working Style

Before implementing a feature:

1. Understand the existing architecture.
2. Inspect relevant files.
3. Plan the smallest correct implementation.
4. Implement it.
5. Test it.
6. Review the diff.
7. Commit.
8. Push.
9. Create/update the PR.

Do not blindly rewrite existing code.

Prefer incremental changes.

When uncertain about an architectural decision, explain the tradeoff before making a large
structural change.

## Important

The repository is a real product codebase.

Optimize for:

- maintainability
- correctness
- security
- scalability
- developer experience
- predictable architecture

Do not optimize for producing the maximum amount of code.

Build the smallest production-quality implementation required for the current feature.

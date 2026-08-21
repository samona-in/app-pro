# SAMONA

Monorepo for **SAMONA**, an on-demand marketplace connecting customers with local
skilled professionals.

This repository currently contains **SAMONA Pro** — the professional-side mobile
app — and the shared backend that will also serve the customer and admin
surfaces.

> Engineering standards and the required Git workflow live in
> [CLAUDE.md](CLAUDE.md). Read it before contributing.

**Status:** foundation scaffold. The architecture, design system and module
boundaries are in place; marketplace features are not implemented yet.

---

## Project structure

```
apps/
  pro/                 SAMONA Pro — Expo + React Native app (the app being built)
  customer/            Reserved for the customer app; placeholder only

server/                Node.js + Express API — organised by business domain

packages/
  types/               Shared domain types (UserRole, JobStatus, API envelopes)
  api-client/          Typed HTTP client used by the mobile apps
  config/              Shared constants and environment-key names
  validation/          Zod schemas shared by client and server
```

The backend is deliberately **not** Pro-specific: adding `apps/customer` later
requires no backend restructuring.

### Inside `apps/pro`

```
src/
  app/                 Expo Router routes (file-based)
    (auth)/welcome     Onboarding entry point
    (tabs)/            home · jobs · earnings · profile
    job/[id]           Job detail
    notifications
  components/
    ui/                Button, Card, Text, Input, Avatar, Badge, IconButton,
                       Divider, Screen
    feedback/          LoadingState, ErrorState, EmptyState
    brand/             Temporary SAMONA PRO wordmark
  theme/               Design tokens: colors, typography, spacing, radius, shadows
  stores/              Zustand — client state only
  services/            API client instance and secure token storage
  providers/           TanStack Query, gesture handler, safe area
  hooks/ types/ utils/ constants/
```

Routes live under `src/app` (the Expo SDK 57 default); `@/*` maps to `src/*`.

### Inside `server`

```
src/
  index.ts             Entry point: config, connections, listen, shutdown
  app.ts               Express app (no sockets) — importable by tests
  context.ts           Explicit service composition, in place of a DI container
  routes.ts            Mounts every domain router under /api/v1
  common/
    errors.ts          HttpError + typed constructors
    logger.ts
    middleware/        request-id · validate (Zod) · auth · error-handler
  config/              Env validation (Zod) and typed configuration
  database/            Prisma and Redis client factories
  realtime/            Socket.IO gateway (connection lifecycle only)
  health/

  auth/ users/ pros/ customers/ services/ jobs/ matching/
  locations/ payments/ earnings/ notifications/ reviews/
```

Each domain owns its own `<domain>.routes.ts` and `<domain>.service.ts`. There
is no global `controllers/` or `services/` folder — see CLAUDE.md →
*Architecture*. `matching` has no router by design: it is an internal service
that `jobs` drives.

**Dependency wiring.** There is no DI container. `context.ts` calls each
`create<Domain>Service({ prisma })` factory once and passes the result to the
route factories, so wiring stays greppable and services are trivial to build in
tests with a stub client. `createApp()` takes its dependencies as arguments and
opens no sockets, which is what lets the e2e suite run without PostgreSQL or
Redis.

---

## Requirements

- **Node.js ≥ 20.19** (developed on 24.x)
- **npm ≥ 10** (the repo uses npm workspaces)
- **PostgreSQL 14+** and **Redis 6+** for the backend
- Expo Go, or an iOS Simulator / Android Emulator, to run the app

---

## Install

```bash
git clone https://github.com/samona-in/app-pro.git
cd app-pro
npm install
```

`npm install` also builds the shared packages (via each package's `prepare`
script) and generates the Prisma client (`server` `postinstall`), so the
workspace typechecks immediately after a clean clone.

---

## Environment variables

Two example files, because Expo only reads `.env` from the app directory:

| File | Consumed by | Copy to |
| --- | --- | --- |
| [`.env.example`](.env.example) | `server` | `.env` |
| [`apps/pro/.env.example`](apps/pro/.env.example) | `apps/pro` | `apps/pro/.env` |

```bash
cp .env.example .env
cp apps/pro/.env.example apps/pro/.env
```

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | server | Supabase **pooled** connection (port 6543) used at runtime |
| `DIRECT_URL` | server | Supabase **direct** connection (port 5432), migrations only |
| `CLERK_SECRET_KEY` | server | Clerk server key |
| `CLERK_PUBLISHABLE_KEY` | server | Also needed server-side, to verify tokens |
| `CLERK_WEBHOOK_SIGNING_SECRET` | server | Verifies Clerk webhook signatures |
| `SIGNUP_DEFAULT_ROLE` | server | Role given on first sign-in (`PRO` today) |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | app | Clerk key for the mobile app |
| `REDIS_URL` | server | Redis connection string |
| `PORT` | server | API port (default `4000`) |
| `CORS_ORIGINS` | server | Comma-separated allowed origins |
| `GOOGLE_MAPS_API_KEY` | server | Server-side geocoding / distance |
| `EXPO_PUBLIC_API_URL` | app | Base URL of the API |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | app | Maps key for the client |

The server validates its environment with Zod at boot and refuses to start if
anything is missing or malformed.

**Never commit a real `.env`.** Anything prefixed `EXPO_PUBLIC_` is inlined into
the app bundle and is public by definition — never put a secret behind it.

---

## Running the backend

Start PostgreSQL and Redis, then:

```bash
cp .env.example .env          # set DATABASE_URL and a real JWT_SECRET

npm run prisma:migrate -w @samona/server   # create the schema
npm run dev:server                          # http://localhost:4000/api/v1
```

Verify it is up:

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok","uptimeSeconds":1,"timestamp":"..."}
```

Prisma 7 takes its connection URL from `server/prisma.config.ts` (for
migrations) and from the driver adapter in `PrismaService` (at runtime) — not
from `schema.prisma`.

---

## Running the Pro app

```bash
cp apps/pro/.env.example apps/pro/.env
npm run dev:pro
```

Then press `i` (iOS Simulator), `a` (Android Emulator) or `w` (web), or scan the
QR code with Expo Go.

Testing on a **physical device**: set `EXPO_PUBLIC_API_URL` to your machine's LAN
IP (e.g. `http://192.168.1.20:4000`). `localhost` resolves to the device itself.

---

## Scripts

Run from the repository root.

| Script | What it does |
| --- | --- |
| `npm run dev` / `dev:pro` | Start the Expo dev server |
| `npm run dev:server` | Start the API in watch mode |
| `npm run build` | Build every workspace |
| `npm run build:packages` | Build only the shared packages |
| `npm run lint` / `lint:fix` | ESLint across the whole monorepo |
| `npm run typecheck` | Typecheck every workspace |
| `npm run test` | Run every workspace's tests |
| `npm run format` / `format:check` | Prettier |
| `npm run verify` | lint → typecheck → test |
| `npm run clean` | Remove build output |

Workspace-specific:

| Script | Workspace |
| --- | --- |
| `npm run test:e2e -w @samona/server` | Backend e2e tests |
| `npm run prisma:migrate -w @samona/server` | Create/apply a migration |
| `npm run prisma:studio -w @samona/server` | Browse the database |
| `npm run doctor -w @samona/pro` | `expo-doctor` project validation |
| `npm run build -w @samona/pro` | Static web export (bundle check) |

Run `npm run verify` before opening a pull request.

---

## Architecture notes

**Server state vs client state.** TanStack Query owns everything that comes from
the API. Zustand holds only client concerns (the availability toggle, network
status). Server data is never duplicated into Zustand.

**One authentication system.** Customer, Pro and Admin share one `User` table and
one auth system, with **Clerk** as the identity provider and phone + SMS code as
the sign-in method. Clerk owns credentials and verification — no OTP or password
ever reaches this codebase. A Clerk token proves *identity*; `role` is read from
our own `User` row, so a token claim can never escalate privileges. Users are
provisioned just-in-time on first authenticated request and kept current by a
signature-verified Clerk webhook.

**Job state machine.** `JOB_STATUS_TRANSITIONS` in `@samona/types` is the shared
contract. Clients *request* transitions; the server validates and applies them.

**One error envelope.** Every failure returns
`{ error: { code, message, details?, requestId? } }`. Stack traces, database
errors and infrastructure details never reach a client. The API client
normalises transport failures and timeouts into the same `ApiError` shape.

**Abuse prevention.** Every route sits behind a Redis-backed rate limiter, tiered
by how expensive the operation is (`auth`, `write`, `expensive`, `location`, plus a
global baseline). Limits are keyed by user id when authenticated and by
normalised IP otherwise, so one abusive account cannot hide behind rotating
addresses. Credential endpoints add a per-identity lockout, because rate limits
are keyed by *caller* and a password spray uses many callers against one account.
Counters live in Redis so all instances share one budget; if Redis is down the
limiters degrade to in-process counters rather than switching off. The client
honours `Retry-After` and backs off with full jitter. See CLAUDE.md →
*Abuse Prevention*.

**No classes.** The codebase is functional throughout: factory functions and
closures instead of instances, function components in React Native, and errors
built with `new Error()` plus a type guard rather than an `Error` subclass.
Because there is no custom error class, identify errors with `isApiError` /
`isHttpError`, never `instanceof`. ESLint enforces this via
`no-restricted-syntax`; see CLAUDE.md → *Code Quality*.

**Validation.** Zod schemas in `@samona/validation` are shared by both sides.
The client validates for fast feedback; the server's validation is authoritative.

### Pinned-version notes

- **Tailwind CSS is pinned to 3.4.x**, not 4.x. NativeWind 4 declares
  `tailwindcss: ~3`; Tailwind 4's CSS-first config is only supported by
  `nativewind@5` (still in preview). Design tokens live in
  `apps/pro/src/theme/tokens.js`, which feeds both `tailwind.config.js` and the
  typed theme modules.
- **Jest is pinned to 29.x** across the repo because
  `@react-native/jest-preset@0.86` requires the Jest 29 line.
- **`@testing-library/react-native` is pinned to 13.x.** Version 14 did not
  return queries from `render()` under the `jest-expo` preset.
- **TypeScript 6** no longer auto-discovers `@types` packages that npm hoists to
  the workspace root, so `types` is listed explicitly in each `tsconfig.json`.
- **Express 5** handles rejected promises from `async` handlers natively, so
  there is no `asyncHandler` wrapper. There is a test asserting this.
- **The shared packages use TypeScript project references** and build with
  `tsc -b`. npm does not order workspace `prepare` scripts by dependency, so
  without references `@samona/validation` could compile before `@samona/types`
  had emitted its declarations.

---

## Not implemented yet

Deliberately out of scope for this scaffold: authentication flows, job matching,
payments, realtime job events, the customer app, and the `files` and `admin`
backend domains. Screens render polished placeholder content and perform no API
calls.

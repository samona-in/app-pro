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

server/                NestJS API — organised by business domain

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
  common/              Error filter, Zod pipe, roles guard, request-id, health
  config/              Env validation (Zod) and typed configuration
  database/            Prisma and Redis services
  realtime/            Socket.IO gateway (connection lifecycle only)

  auth/ users/ pros/ customers/ services/ jobs/ matching/
  locations/ payments/ earnings/ notifications/ reviews/
```

Each domain owns its own module, service and controller. There is no global
`controllers/` or `services/` folder — see CLAUDE.md → *Architecture*.

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
| `DATABASE_URL` | server | PostgreSQL connection string |
| `REDIS_URL` | server | Redis connection string |
| `JWT_SECRET` | server | Token signing secret (min. 32 chars) |
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
one auth system. Roles are enforced on the server via `@Roles()` and
`RolesGuard`; a role sent by a client is never trusted.

**Job state machine.** `JOB_STATUS_TRANSITIONS` in `@samona/types` is the shared
contract. Clients *request* transitions; the server validates and applies them.

**One error envelope.** Every failure returns
`{ error: { code, message, details?, requestId? } }`. Stack traces, database
errors and infrastructure details never reach a client. `ApiClient` normalises
transport failures and timeouts into the same `ApiError` type.

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

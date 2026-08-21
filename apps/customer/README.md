# SAMONA Customer — reserved

This workspace is a placeholder. The customer application is **not implemented yet**.

It exists now so the monorepo shape is settled: when the customer app is built it
drops in here and consumes the same backend and the same shared packages as
SAMONA Pro, with no restructuring required.

## What it will reuse

| Package | Role |
| --- | --- |
| `@samona/types` | `UserRole`, `JobStatus`, API envelopes — one definition for both apps |
| `@samona/api-client` | The same typed HTTP client, pointed at the same API |
| `@samona/config` | Shared constants and environment-key names |
| `@samona/validation` | Shared Zod schemas, so both clients validate identically |

## What it must not do

- Do not fork authentication. One auth system serves Customer, Pro and Admin;
  roles are enforced on the server (see `CLAUDE.md` → *Authentication*).
- Do not duplicate domain types locally. Extend `@samona/types` instead.
- Do not add customer-specific endpoints that bypass the shared API client.

Scaffold it the same way as `apps/pro` when work begins.

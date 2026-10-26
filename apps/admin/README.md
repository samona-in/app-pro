This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

This app lives in an npm-workspaces monorepo, so the Vercel project is created
from the repository root and then pointed at this directory:

| Setting          | Value                        |
| ---------------- | ---------------------------- |
| Framework Preset | Next.js (auto-detected)      |
| Root Directory   | `apps/admin`                 |
| Build Command    | `npm run build` (default)    |
| Install Command  | `npm install` (default)      |
| Node.js Version  | 22.x                         |

Vercel detects the workspace root above `apps/admin` and installs from the
committed `package-lock.json`, so `node_modules` resolution stays shared with
the other workspaces.

Environment variables (Production and Preview). `NEXT_PUBLIC_*` values are
inlined at build time, so they must exist before the build runs:

```bash
NEXT_PUBLIC_API_URL=https://api.samona.in/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://mbylupexffssmyiqgwnb.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### Custom domain is required

The dashboard authenticates with the HttpOnly `admin_session` cookie, which the
API mints with `SameSite=Lax`. Browsers only send that cookie on same-site
requests, so the dashboard must be served from a `*.samona.in` hostname:

- `admin.samona.in` → Vercel. The API's `CORS_ORIGINS` already allow-list this
  origin (`https://admin.samona.in`).
- The generated `*.vercel.app` hostname will load, but every API call fails
  CORS, and the session cookie would be treated as third-party.

If a Vercel preview hostname must work, add it to `CORS_ORIGINS` on the API and
switch the cookie to `SameSite=None; Secure`.

```bash
# DNS for the custom domain (Vercel → Project → Settings → Domains)
admin.samona.in  CNAME  cname.vercel-dns.com
```

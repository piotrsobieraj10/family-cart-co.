# Family Cart

A shared shopping list PWA for families and households. Built with TanStack Start (SSR), React 19, Tailwind v4, and Supabase (auth + database).

## Stack

- **Framework**: TanStack Start v1.167 (SSR, file-based routing)
- **UI**: React 19, Tailwind v4, shadcn/ui components
- **Backend**: Supabase (external managed service — auth + PostgreSQL)
- **i18n**: Polish/English
- **PWA**: Service worker with VAPID push notifications

## Running the app

```bash
bun run dev
```

Runs on port 5000.

## Key files

- `src/router.tsx` — TanStack router setup
- `src/start.ts` — TanStack Start instance with Supabase auth middleware
- `src/server.ts` — SSR entry point
- `src/routeTree.gen.ts` — auto-generated route tree
- `src/integrations/supabase/` — Supabase client, auth middleware, types
- `vite.config.ts` — Vite config with TanStack Start plugin

## Environment variables

Set in Replit's environment panel:

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- `VITE_REGISTRATION_MODE` — `open` | `invite_code` | `disabled`
- `VITE_EMAIL_CONFIRMATION_REQUIRED` — `true` | `false`
- `VITE_VAPID_PUBLIC_KEY` — VAPID public key for push notifications

Server-only secrets (add to Replit Secrets if needed):
- `SUPABASE_SERVICE_ROLE_KEY` — for server-side admin operations only
- `VAPID_PRIVATE_KEY` — for sending push notifications

## User preferences

- Keep Supabase as the backend (do not migrate to Replit Postgres or Replit Auth)
- The Supabase anon key is safe to expose via VITE_ prefix (it's a public key by design)

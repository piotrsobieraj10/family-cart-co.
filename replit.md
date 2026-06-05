# Family Cart

A shared shopping list PWA for families and households. Built with TanStack Start (SSR), React 19, Tailwind v4, and Replit PostgreSQL + JWT auth.

## Stack

- **Framework**: TanStack Start v1.167 (SSR, file-based routing)
- **UI**: React 19, Tailwind v4, shadcn/ui components
- **Backend**: Replit PostgreSQL (DATABASE_URL) + własny JWT (jose + bcryptjs)
- **i18n**: Polish/English
- **PWA**: Service worker z VAPID push notifications (stub — wymaga VAPID_PRIVATE_KEY)

## Running the app

```bash
npm run dev
```

Runs on port 5000.

## Key files

- `src/router.tsx` — TanStack router setup
- `src/start.ts` — TanStack Start instance with JWT Bearer middleware
- `src/server.ts` — SSR entry point
- `src/routeTree.gen.ts` — auto-generated route tree
- `src/lib/auth.ts` — useAuth hook, getStoredToken, storeToken, clearToken
- `src/lib/auth.server.ts` — JWT sign/verify, bcrypt hash/verify
- `src/lib/api/auth.functions.ts` — loginFn, registerFn, getMeFn, getMyProfileFn
- `src/lib/api/data.functions.ts` — shopping lists, items, household, dictionary
- `src/integrations/db/` — Replit PostgreSQL client (postgres npm package)
- `src/integrations/supabase/auth-attacher.ts` — Bearer token middleware (uses getStoredToken)
- `db/schema.sql` — full DB schema for Replit PostgreSQL
- `vite.config.ts` — Vite config (tanstackStart → react → tailwindcss order is required)

## Database

Replit PostgreSQL — wszystkie tabele tworzone przez `db/schema.sql`.

Tabele: users, profiles, households, household_members, shopping_lists, shopping_items,
stores, receipts, receipt_items, product_price_history, household_product_dictionary,
activity_log, push_subscriptions, push_notification_log, pantry_items, recurring_products,
registration_codes, item_photos, shopping_list_notes.

## Environment variables

Set in Replit's environment panel:

- `DATABASE_URL` — Replit PostgreSQL connection string (auto-set by Replit)
- `JWT_SECRET` — secret for signing JWT tokens (defaults to "change-me-in-production")
- `VITE_REGISTRATION_MODE` — `open` | `invite_code` | `disabled`
- `VITE_EMAIL_CONFIRMATION_REQUIRED` — `true` | `false`
- `VITE_VAPID_PUBLIC_KEY` — VAPID public key for push notifications (optional)

Server-only secrets:
- `VAPID_PRIVATE_KEY` — for sending push notifications (optional, stub if missing)

## Admin account

- Email: biuro@autosafe.immo
- Hasło: adminn (must_change_password = true)
- Dom: AutoSafe (role: owner)

## User preferences

- Używamy Replit PostgreSQL + własny JWT (nie Supabase, nie Replit Auth)
- Vite plugin order: tanstackStart() MUSI być przed react() w plugins[]
- auth-attacher.ts używa getStoredToken() (nie getAccessToken)

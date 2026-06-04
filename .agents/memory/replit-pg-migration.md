---
name: Replit PostgreSQL migration
description: Kompletna migracja z Supabase do Replit PostgreSQL + własne JWT auth
---

## Stan końcowy
Supabase całkowicie usunięty. Wszystkie komponenty używają server functions z data.functions.ts.

## Architektura
- **DB**: `src/integrations/db/index.ts` — `postgres(DATABASE_URL)` bez opcji ssl (wewnętrzny klaster helium)
- **Auth**: `src/lib/auth.server.ts` — bcrypt + jose JWT; token `fc.token` w localStorage
- **Middleware**: `src/integrations/supabase/auth-attacher.ts` — czyta fc.token, ustawia Authorization header
- **Weryfikacja JWT**: `src/integrations/supabase/auth-middleware.ts` — verify JWT, piszę user do context
- **Server functions**: `src/lib/api/auth.functions.ts` i `src/lib/api/data.functions.ts`

## Pliki stubowane (Supabase shell)
- `src/integrations/supabase/client.ts` — Proxy rzucający Error
- `src/integrations/supabase/client.server.ts` — Proxy rzucający Error
- `src/lib/api/household.functions.ts` — re-eksport z data.functions.ts

## Admin user
- Email: biuro@autosafe.immo, hasło: adminn
- Household: AutoSafe

**Why:** Replit free tier nie pozwala na Supabase Edge Functions ani zewnętrzne connectory; Replit PG dostępny natywnie.

**How to apply:** Przy dodawaniu nowych funkcji danych — zawsze jako createServerFn w data.functions.ts, z requireUser() + requireHouseholdMember().

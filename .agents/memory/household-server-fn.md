---
name: Household server function
description: addHouseholdUser server function zastępuje Supabase Edge Function
---

# addHouseholdUser server function

**Lokalizacja:** `src/lib/api/household.functions.ts`

**Rule:** Dodawanie użytkownika do household działa przez TanStack Start server function (nie Supabase Edge Function). 

**Why:** Edge Functions wymagają deploy przez Supabase CLI + sekrety w Supabase Dashboard. Server function działa bezpośrednio w Replit z dostępem do SUPABASE_SERVICE_ROLE_KEY jako server-side env var.

**How to apply:**
- Czyta Authorization header przez `getRequestHeader('authorization')` z `@tanstack/start-server-core`
- Weryfikuje JWT przez userClient.auth.getUser()
- Sprawdza rolę owner/admin przez adminClient (service role)
- SUPABASE_SERVICE_ROLE_KEY nigdy nie trafia do klienta — tylko w .handler()

**Uwaga:** Przy tworzeniu nowego usera przez tę funkcję też obowiązuje reguła secure-registration (pending_registrations + token).

---
name: Supabase project setup
description: Konfiguracja nowego projektu Supabase dla Family Cart na Replit
---

# Supabase project setup

**Projekt:** `ixxjezsvcdctifcuinzf` → `https://ixxjezsvcdctifcuinzf.supabase.co`

**Env vars (Replit Secrets — nie shared env vars):**
- `VITE_SUPABASE_URL` = https://ixxjezsvcdctifcuinzf.supabase.co
- `VITE_SUPABASE_ANON_KEY` = anon key tego projektu
- `SUPABASE_SERVICE_ROLE_KEY` = service role key tego projektu

**Why:** Stary projekt (kgwhmhbnypwumxrwbtxt) był z Lovable. Klucze podane przez usera są dla nowego projektu ixxjezsvcdctifcuinzf. Bash tool może pokazywać stary URL ze shared env vars — secrets mają priorytet w workflow.

**How to apply:** Przy debugowaniu połączenia Supabase zawsze sprawdź JWT decode z SUPABASE_SERVICE_ROLE_KEY — pole `ref` to właściwy projekt. Nie ufaj bash $VITE_SUPABASE_URL jeśli jest stary shared env var.

**Naprawione pliki:**
- `src/integrations/supabase/client.ts` → używa VITE_SUPABASE_ANON_KEY (nie PUBLISHABLE_KEY)
- `src/integrations/supabase/client.server.ts` → używa process.env.VITE_SUPABASE_URL
- `src/integrations/supabase/auth-middleware.ts` → używa VITE_SUPABASE_ANON_KEY

# Family Cart - Replit Supabase Repair Patch v26.06.03.6

Ten patch zawiera naprawy przygotowane dla projektu Family Cart po imporcie ZIP-a z GitHuba.
Nie jest to nowa aplikacja i nie zawiera pelnego projektu. Paczka nadpisuje tylko pliki
zmienione podczas naprawy.

## Co naprawia patch

- Przelacza aplikacje na prawdziwy Supabase Auth i Supabase DB.
- Usuwa aktywna sciezke lokalnego Replit PostgreSQL + custom JWT z logowania i server functions.
- Przywraca uzycie `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` oraz `SUPABASE_SERVICE_ROLE_KEY`.
- Usuwa hardcoded Supabase URL, stare klucze i `JWT_SECRET` z konfiguracji Replit.
- Dodaje bezpieczny plik `supabase/migrations/all_migrations_safe.sql`.
- Dodaje skrypt `npm run ensure:admin` do utworzenia lub naprawy konta pierwszego admina.
- Przywraca push notifications jako opcjonalny modul Supabase Edge Functions.
- Poprawia logowanie, rejestracje, aktywny dom, dodawanie czlonkow domu i routing strony glownej.

## Bezpieczenstwo

Patch nie zawiera `.env`, `node_modules`, `dist`, `.git`, prawdziwych kluczy Supabase,
kluczy VAPID ani tokenow. Prawdziwe wartosci nalezy ustawic w Replit Secrets albo w panelu
Supabase, nie w kodzie.

## Replit Secrets / Environment Variables

Ustaw w Replit:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_VAPID_PUBLIC_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:kontakt@autosafe.immo
```

`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` i hasla tymczasowe nie moga trafic do
`VITE_*` ani do repozytorium.

## Migracje Supabase

Uruchom migracje recznie:

1. Otworz Supabase.
2. Przejdz do `SQL Editor`.
3. Kliknij `New query`.
4. Wklej zawartosc pliku:

```text
supabase/migrations/all_migrations_safe.sql
```

5. Kliknij `Run`.

Plik jest przygotowany jako bezpieczny bootstrap: uzywa `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` i `DROP TRIGGER IF EXISTS`.
Nie kasuje danych, tabel, schematu `public` ani uzytkownikow Auth.

## Utworzenie admina

Po ustawieniu Replit Secrets i migracji uruchom:

```bash
ADMIN_TEMP_PASSWORD=adminn npm run ensure:admin
```

Admin:

- email: `biuro@autosafe.immo`
- haslo tymczasowe: `adminn`
- dom: `AutoSafe`
- rola: `owner`

Po pierwszym logowaniu nalezy zmienic haslo na mocniejsze.

## Build i uruchomienie

```bash
npm install
npm run build
npm run dev
```

W Replit mozna tez uzyc przycisku `Run`.

## Testowanie po zastosowaniu patcha

1. Uruchom `npm install`.
2. Uruchom `npm run build`.
3. Uruchom `npm run dev` albo `Run` w Replit.
4. Zaloguj sie jako `biuro@autosafe.immo / adminn`.
5. Sprawdz, czy widoczny jest dom `AutoSafe`.
6. Dodaj czlonka domu.
7. Dodaj produkt.
8. Sprawdz szybka liste.
9. Sprawdz moduly sklepow, cen i paragonow.
10. Push testuj dopiero po ustawieniu VAPID i deploy Edge Functions.

## Push notifications

Push wymaga osobnego wdrozenia Edge Functions:

```bash
supabase functions deploy save-push-subscription
supabase functions deploy delete-push-subscription
supabase functions deploy send-push-notification
```

Wymagane sekrety dla push:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:kontakt@autosafe.immo
SUPABASE_SERVICE_ROLE_KEY=
```

Jesli push nie jest skonfigurowany, aplikacja nadal powinna dzialac dla list zakupow,
domow, czlonkow, sklepow, cen i paragonow.

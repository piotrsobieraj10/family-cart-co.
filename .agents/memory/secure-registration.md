---
name: Secure registration trigger
description: Każdy nowy user w auth.users wymaga pending_registrations + registration_token
---

# Secure registration trigger (handle_new_user)

**Rule:** Tworzenie użytkownika przez Supabase Admin API (`auth.admin.createUser`) ZAWSZE wymaga:
1. Wpisu w `public.pending_registrations` z `token_hash` (SHA256 tokenu) i `registration_source`
2. `user_metadata.registration_token` = surowy token (nie hash)
3. `user_metadata.registration_source` = 'admin_created' lub 'self_signup'

**Why:** Migracja `20260603110000_secure_registration.sql` dodaje trigger `handle_new_user` który sprawdza pending_registrations przed wstawieniem profilu. Bez tego zwraca: `"Registration must be started through the application backend"`.

**How to apply:**
```bash
TOKEN=$(python3 -c "import uuid; print(uuid.uuid4())")
TOKEN_HASH=$(echo -n "$TOKEN" | sha256sum | cut -d' ' -f1)
# 1. INSERT into pending_registrations (token_hash, email, registration_source='admin_created')
# 2. createUser z user_metadata.registration_token=$TOKEN i registration_source='admin_created'
```

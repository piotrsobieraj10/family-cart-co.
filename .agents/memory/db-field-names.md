---
name: DB field names
description: Nazwy kolumn w tabelach Replit PostgreSQL różnią się od Supabase
---

## shopping_items
| Supabase (stare) | Replit PG (nowe) |
|---|---|
| added_by | created_by |
| checked_by | bought_by |
| checked_at | bought_at |
| exact_match_required | ❌ nie istnieje |
| price_observed_at | ❌ nie istnieje |

## Pozostałe ważne kolumny shopping_items
- id, list_id, household_id, name, category, quantity, unit, note, status
- store_id, estimated_unit_price, created_at, updated_at

## shopping_lists
- status: 'active' | 'done' | 'partially_done'
- budget_amount, default_store_id, estimated_total, completed_at

**Why:** Schema pisany od nowa przy migracji — nie kopiowaliśmy Supabase nazw.

**How to apply:** Przy dodawaniu nowych server functions sprawdź te nazwy zanim napiszesz zapytanie SQL.

-- Family Cart safe Supabase bootstrap.
-- Safe to run more than once. It does not drop schemas, tables, auth users, or data.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'viewer');
  ELSE
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'member';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'member_status') THEN
    CREATE TYPE public.member_status AS ENUM ('active', 'invited', 'removed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'list_status') THEN
    CREATE TYPE public.list_status AS ENUM ('active', 'shopping', 'done', 'partially_done', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'item_status') THEN
    CREATE TYPE public.item_status AS ENUM ('active', 'bought', 'unavailable', 'deleted');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  first_name text,
  last_name text,
  must_complete_profile boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS must_complete_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  status public.member_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS label text;

CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Lista zakupow',
  status public.list_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  default_store_id uuid,
  budget_amount numeric,
  estimated_total numeric,
  actual_total numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  unit text,
  category text,
  note text,
  status public.item_status NOT NULL DEFAULT 'active',
  exact_match_required boolean NOT NULL DEFAULT false,
  store_id uuid,
  estimated_unit_price numeric,
  price_observed_at timestamptz,
  added_by uuid NOT NULL REFERENCES auth.users(id),
  checked_by uuid REFERENCES auth.users(id),
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS store_id uuid,
  ADD COLUMN IF NOT EXISTS estimated_unit_price numeric,
  ADD COLUMN IF NOT EXISTS price_observed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.shopping_items(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/webp',
  size_bytes integer,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.normalize_household_phrase(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(lower(COALESCE(_value, '')), '[^[:alnum:]]+', ' ', 'g'));
$$;

CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, normalized_name)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shopping_lists_default_store_id_fkey'
  ) THEN
    ALTER TABLE public.shopping_lists
      ADD CONSTRAINT shopping_lists_default_store_id_fkey
      FOREIGN KEY (default_store_id) REFERENCES public.stores(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shopping_items_store_id_fkey'
  ) THEN
    ALTER TABLE public.shopping_items
      ADD CONSTRAINT shopping_items_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.household_product_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  normalized_phrase text,
  category text,
  default_unit text,
  default_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  barcode text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.household_product_dictionary
  ADD COLUMN IF NOT EXISTS normalized_phrase text,
  ADD COLUMN IF NOT EXISTS default_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.household_product_dictionary
SET normalized_phrase = public.normalize_household_phrase(phrase)
WHERE normalized_phrase IS NULL OR normalized_phrase = '';

CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  receipt_date date,
  image_url text,
  total_amount numeric,
  ocr_status text NOT NULL DEFAULT 'pending',
  ocr_error text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  raw_name text NOT NULL,
  normalized_name text,
  matched_product_name text,
  quantity numeric,
  unit text,
  unit_price numeric,
  total_price numeric,
  category text,
  confidence numeric,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  normalized_product_name text NOT NULL,
  category text,
  price numeric NOT NULL CHECK (price >= 0),
  unit text,
  source_receipt_item_id uuid REFERENCES public.receipt_items(id) ON DELETE SET NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.registration_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  code_id uuid REFERENCES public.registration_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  preferences jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, household_id, endpoint)
);

CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(lower(email));
CREATE INDEX IF NOT EXISTS idx_household_members_user ON public.household_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON public.household_members(household_id, status);
CREATE INDEX IF NOT EXISTS idx_lists_household ON public.shopping_lists(household_id, status);
CREATE INDEX IF NOT EXISTS idx_items_list ON public.shopping_items(list_id, status);
CREATE INDEX IF NOT EXISTS idx_items_household ON public.shopping_items(household_id);
CREATE INDEX IF NOT EXISTS idx_stores_household ON public.stores(household_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS household_product_dictionary_household_phrase_key
  ON public.household_product_dictionary(household_id, normalized_phrase);
CREATE INDEX IF NOT EXISTS idx_receipts_household ON public.receipts(household_id, receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_price_history_lookup
  ON public.product_price_history(household_id, store_id, normalized_product_name, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_enabled
  ON public.push_subscriptions(user_id, enabled);

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_households_updated ON public.households;
CREATE TRIGGER trg_households_updated BEFORE UPDATE ON public.households
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lists_updated ON public.shopping_lists;
CREATE TRIGGER trg_lists_updated BEFORE UPDATE ON public.shopping_lists
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_items_updated ON public.shopping_items;
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.shopping_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email, first_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'first_name', '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_household_member(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id AND household_id = _household_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id
      AND household_id = _household_id
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_product_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_self_read" ON public.profiles;
CREATE POLICY "profile_self_read" ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "profile_self_update" ON public.profiles;
CREATE POLICY "profile_self_update" ON public.profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "household_member_read" ON public.households;
CREATE POLICY "household_member_read" ON public.households FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), id));

DROP POLICY IF EXISTS "members_read" ON public.household_members;
CREATE POLICY "members_read" ON public.household_members FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

DROP POLICY IF EXISTS "lists_member_read" ON public.shopping_lists;
CREATE POLICY "lists_member_read" ON public.shopping_lists FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

DROP POLICY IF EXISTS "items_member_read" ON public.shopping_items;
CREATE POLICY "items_member_read" ON public.shopping_items FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

DROP POLICY IF EXISTS "dictionary_member_read" ON public.household_product_dictionary;
CREATE POLICY "dictionary_member_read" ON public.household_product_dictionary FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

DROP POLICY IF EXISTS "stores_member_read" ON public.stores;
CREATE POLICY "stores_member_read" ON public.stores FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

DROP POLICY IF EXISTS "receipts_member_read" ON public.receipts;
CREATE POLICY "receipts_member_read" ON public.receipts FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

DROP POLICY IF EXISTS "push_subscriptions_own_read" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_own_read" ON public.push_subscriptions FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.is_household_member(auth.uid(), household_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

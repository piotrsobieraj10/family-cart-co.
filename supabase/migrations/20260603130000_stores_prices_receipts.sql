-- Stores, household product memory, price history, receipts and future convenience modules.

CREATE OR REPLACE FUNCTION public.normalize_household_phrase(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(lower(COALESCE(_value, '')), '[^[:alnum:]]+', ' ', 'g'));
$$;

ALTER TABLE public.household_product_dictionary
  ADD COLUMN IF NOT EXISTS normalized_phrase text,
  ADD COLUMN IF NOT EXISTS default_store_id uuid,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.household_product_dictionary
  ALTER COLUMN category DROP NOT NULL;

UPDATE public.household_product_dictionary
SET normalized_phrase = public.normalize_household_phrase(phrase)
WHERE normalized_phrase IS NULL OR normalized_phrase = '';

DELETE FROM public.household_product_dictionary dictionary
USING public.household_product_dictionary duplicate
WHERE dictionary.household_id = duplicate.household_id
  AND dictionary.normalized_phrase = duplicate.normalized_phrase
  AND dictionary.id > duplicate.id;

ALTER TABLE public.household_product_dictionary
  ALTER COLUMN normalized_phrase SET NOT NULL;

ALTER TABLE public.household_product_dictionary
  DROP CONSTRAINT IF EXISTS household_product_dictionary_household_id_phrase_key;
CREATE UNIQUE INDEX IF NOT EXISTS household_product_dictionary_household_phrase_key
  ON public.household_product_dictionary (household_id, normalized_phrase);
CREATE INDEX IF NOT EXISTS idx_dictionary_household_barcode
  ON public.household_product_dictionary (household_id, barcode)
  WHERE barcode IS NOT NULL;

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

ALTER TABLE public.household_product_dictionary
  DROP CONSTRAINT IF EXISTS household_product_dictionary_default_store_id_fkey;
ALTER TABLE public.household_product_dictionary
  ADD CONSTRAINT household_product_dictionary_default_store_id_fkey
  FOREIGN KEY (default_store_id) REFERENCES public.stores(id) ON DELETE SET NULL;

ALTER TABLE public.shopping_lists
  ADD COLUMN IF NOT EXISTS default_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_amount numeric,
  ADD COLUMN IF NOT EXISTS estimated_total numeric,
  ADD COLUMN IF NOT EXISTS actual_total numeric;

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimated_unit_price numeric,
  ADD COLUMN IF NOT EXISTS price_observed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  receipt_date date,
  image_url text,
  total_amount numeric,
  ocr_status text NOT NULL DEFAULT 'pending'
    CHECK (ocr_status IN ('pending', 'awaiting_review', 'confirmed', 'failed')),
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

CREATE TABLE IF NOT EXISTS public.pantry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  quantity numeric,
  unit text,
  location text,
  expiry_date date,
  note text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recurring_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  normalized_product_name text NOT NULL,
  category text,
  quantity numeric,
  unit text,
  interval_days integer NOT NULL CHECK (interval_days > 0),
  next_due_date date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shopping_list_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_household ON public.stores(household_id, name);
CREATE INDEX IF NOT EXISTS idx_receipts_household ON public.receipts(household_id, receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_price_history_lookup
  ON public.product_price_history(household_id, store_id, normalized_product_name, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pantry_household ON public.pantry_items(household_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_recurring_household ON public.recurring_products(household_id, next_due_date);
CREATE INDEX IF NOT EXISTS idx_list_notes_list ON public.shopping_list_notes(list_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_normalized_household_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'stores' THEN
    NEW.normalized_name := public.normalize_household_phrase(NEW.name);
  ELSIF TG_TABLE_NAME = 'household_product_dictionary' THEN
    NEW.normalized_phrase := public.normalize_household_phrase(NEW.phrase);
  ELSIF TG_TABLE_NAME = 'receipt_items' THEN
    NEW.normalized_name := public.normalize_household_phrase(NEW.raw_name);
  ELSIF TG_TABLE_NAME = 'product_price_history' THEN
    NEW.normalized_product_name := public.normalize_household_phrase(NEW.product_name);
  ELSIF TG_TABLE_NAME = 'pantry_items' THEN
    NEW.normalized_name := public.normalize_household_phrase(NEW.name);
  ELSIF TG_TABLE_NAME = 'recurring_products' THEN
    NEW.normalized_product_name := public.normalize_household_phrase(NEW.product_name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_convenience_household_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME IN ('shopping_items', 'receipts', 'receipt_items', 'product_price_history') THEN
    IF NEW.store_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = NEW.store_id AND household_id = NEW.household_id
    ) THEN
      RAISE EXCEPTION 'Store must belong to the same household';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'shopping_lists' THEN
    IF NEW.default_store_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.stores
      WHERE id = NEW.default_store_id AND household_id = NEW.household_id
    ) THEN
      RAISE EXCEPTION 'Default store must belong to the same household';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'receipt_items' AND NOT EXISTS (
    SELECT 1 FROM public.receipts
    WHERE id = NEW.receipt_id AND household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'Receipt item must belong to the same household as receipt';
  END IF;

  IF TG_TABLE_NAME = 'shopping_list_notes' AND NOT EXISTS (
    SELECT 1 FROM public.shopping_lists
    WHERE id = NEW.list_id AND household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'List note must belong to the same household as list';
  END IF;

  IF TG_TABLE_NAME = 'household_product_dictionary' AND NEW.default_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = NEW.default_store_id AND household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'Dictionary store must belong to the same household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stores_normalized ON public.stores;
CREATE TRIGGER trg_stores_normalized
BEFORE INSERT OR UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.set_normalized_household_fields();

DROP TRIGGER IF EXISTS trg_dictionary_normalized ON public.household_product_dictionary;
CREATE TRIGGER trg_dictionary_normalized
BEFORE INSERT OR UPDATE ON public.household_product_dictionary
FOR EACH ROW EXECUTE FUNCTION public.set_normalized_household_fields();

DROP TRIGGER IF EXISTS trg_receipt_items_normalized ON public.receipt_items;
CREATE TRIGGER trg_receipt_items_normalized
BEFORE INSERT OR UPDATE ON public.receipt_items
FOR EACH ROW EXECUTE FUNCTION public.set_normalized_household_fields();

DROP TRIGGER IF EXISTS trg_price_history_normalized ON public.product_price_history;
CREATE TRIGGER trg_price_history_normalized
BEFORE INSERT OR UPDATE ON public.product_price_history
FOR EACH ROW EXECUTE FUNCTION public.set_normalized_household_fields();

DROP TRIGGER IF EXISTS trg_pantry_items_normalized ON public.pantry_items;
CREATE TRIGGER trg_pantry_items_normalized
BEFORE INSERT OR UPDATE ON public.pantry_items
FOR EACH ROW EXECUTE FUNCTION public.set_normalized_household_fields();

DROP TRIGGER IF EXISTS trg_recurring_products_normalized ON public.recurring_products;
CREATE TRIGGER trg_recurring_products_normalized
BEFORE INSERT OR UPDATE ON public.recurring_products
FOR EACH ROW EXECUTE FUNCTION public.set_normalized_household_fields();

DROP TRIGGER IF EXISTS trg_receipts_consistency ON public.receipts;
CREATE TRIGGER trg_receipts_consistency
BEFORE INSERT OR UPDATE ON public.receipts
FOR EACH ROW EXECUTE FUNCTION public.guard_convenience_household_consistency();

DROP TRIGGER IF EXISTS trg_lists_store_consistency ON public.shopping_lists;
CREATE TRIGGER trg_lists_store_consistency
BEFORE INSERT OR UPDATE ON public.shopping_lists
FOR EACH ROW EXECUTE FUNCTION public.guard_convenience_household_consistency();

DROP TRIGGER IF EXISTS trg_items_store_consistency ON public.shopping_items;
CREATE TRIGGER trg_items_store_consistency
BEFORE INSERT OR UPDATE ON public.shopping_items
FOR EACH ROW EXECUTE FUNCTION public.guard_convenience_household_consistency();

DROP TRIGGER IF EXISTS trg_receipt_items_consistency ON public.receipt_items;
CREATE TRIGGER trg_receipt_items_consistency
BEFORE INSERT OR UPDATE ON public.receipt_items
FOR EACH ROW EXECUTE FUNCTION public.guard_convenience_household_consistency();

DROP TRIGGER IF EXISTS trg_price_history_consistency ON public.product_price_history;
CREATE TRIGGER trg_price_history_consistency
BEFORE INSERT OR UPDATE ON public.product_price_history
FOR EACH ROW EXECUTE FUNCTION public.guard_convenience_household_consistency();

DROP TRIGGER IF EXISTS trg_list_notes_consistency ON public.shopping_list_notes;
CREATE TRIGGER trg_list_notes_consistency
BEFORE INSERT OR UPDATE ON public.shopping_list_notes
FOR EACH ROW EXECUTE FUNCTION public.guard_convenience_household_consistency();

DROP TRIGGER IF EXISTS trg_dictionary_store_consistency ON public.household_product_dictionary;
CREATE TRIGGER trg_dictionary_store_consistency
BEFORE INSERT OR UPDATE ON public.household_product_dictionary
FOR EACH ROW EXECUTE FUNCTION public.guard_convenience_household_consistency();

DROP TRIGGER IF EXISTS trg_stores_updated ON public.stores;
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_receipts_updated ON public.receipts;
CREATE TRIGGER trg_receipts_updated BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_pantry_items_updated ON public.pantry_items;
CREATE TRIGGER trg_pantry_items_updated BEFORE UPDATE ON public.pantry_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_recurring_products_updated ON public.recurring_products;
CREATE TRIGGER trg_recurring_products_updated BEFORE UPDATE ON public.recurring_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_dictionary_updated ON public.household_product_dictionary;
CREATE TRIGGER trg_dictionary_updated BEFORE UPDATE ON public.household_product_dictionary
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_member_item_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS DISTINCT FROM OLD.household_id
    OR NEW.added_by IS DISTINCT FROM OLD.added_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Item ownership fields cannot be changed';
  END IF;

  IF auth.role() = 'service_role'
    OR public.is_household_admin(auth.uid(), OLD.household_id)
    OR OLD.added_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  IF NEW.household_id IS DISTINCT FROM OLD.household_id
    OR NEW.list_id IS DISTINCT FROM OLD.list_id
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.note IS DISTINCT FROM OLD.note
    OR NEW.exact_match_required IS DISTINCT FROM OLD.exact_match_required
    OR NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.estimated_unit_price IS DISTINCT FROM OLD.estimated_unit_price
    OR NEW.price_observed_at IS DISTINCT FROM OLD.price_observed_at
    OR NEW.added_by IS DISTINCT FROM OLD.added_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Members can only change the status of products added by other users';
  END IF;

  IF NEW.status = 'deleted' THEN
    RAISE EXCEPTION 'Members cannot delete products added by other users';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_notes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_price_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_notes TO authenticated;
GRANT ALL ON public.stores, public.receipts, public.receipt_items, public.product_price_history,
  public.pantry_items, public.recurring_products, public.shopping_list_notes TO service_role;

CREATE POLICY "stores_member_read" ON public.stores FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "stores_admin_insert" ON public.stores FOR INSERT TO authenticated
  WITH CHECK (public.is_household_admin(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "stores_admin_update" ON public.stores FOR UPDATE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id))
  WITH CHECK (public.is_household_admin(auth.uid(), household_id));
CREATE POLICY "stores_admin_delete" ON public.stores FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "receipts_member_read" ON public.receipts FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "receipts_contributor_insert" ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "receipts_owner_or_admin_update" ON public.receipts FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_household_admin(auth.uid(), household_id))
  WITH CHECK (created_by = auth.uid() OR public.is_household_admin(auth.uid(), household_id));
CREATE POLICY "receipts_owner_or_admin_delete" ON public.receipts FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "receipt_items_member_read" ON public.receipt_items FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "receipt_items_contributor_insert" ON public.receipt_items FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id));
CREATE POLICY "receipt_items_contributor_update" ON public.receipt_items FOR UPDATE TO authenticated
  USING (public.can_add_household_items(auth.uid(), household_id))
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id));
CREATE POLICY "receipt_items_admin_delete" ON public.receipt_items FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "price_history_member_read" ON public.product_price_history FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "price_history_contributor_insert" ON public.product_price_history FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "price_history_admin_delete" ON public.product_price_history FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "pantry_member_read" ON public.pantry_items FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "pantry_contributor_insert" ON public.pantry_items FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "pantry_contributor_update" ON public.pantry_items FOR UPDATE TO authenticated
  USING (public.can_add_household_items(auth.uid(), household_id))
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id));
CREATE POLICY "pantry_admin_delete" ON public.pantry_items FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "recurring_member_read" ON public.recurring_products FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "recurring_contributor_insert" ON public.recurring_products FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "recurring_contributor_update" ON public.recurring_products FOR UPDATE TO authenticated
  USING (public.can_add_household_items(auth.uid(), household_id))
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id));
CREATE POLICY "recurring_admin_delete" ON public.recurring_products FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "list_notes_member_read" ON public.shopping_list_notes FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "list_notes_contributor_insert" ON public.shopping_list_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "list_notes_owner_or_admin_delete" ON public.shopping_list_notes FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_household_admin(auth.uid(), household_id));

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipt-images', 'receipt-images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "receipt_images_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipt-images'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "receipt_images_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipt-images'
    AND public.can_add_household_items(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "receipt_images_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipt-images'
    AND public.can_add_household_items(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "receipt_images_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipt-images'
    AND public.can_add_household_items(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

REVOKE EXECUTE ON FUNCTION public.normalize_household_phrase(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_normalized_household_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_convenience_household_consistency() FROM PUBLIC, anon, authenticated;

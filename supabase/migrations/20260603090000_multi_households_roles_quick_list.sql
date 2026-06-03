-- Multi-household accounts, role enforcement, onboarding flags and private photos.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS must_complete_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS label text;

ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'viewer');
ALTER TABLE public.household_members ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.household_members
  ALTER COLUMN role TYPE public.app_role
  USING (
    CASE
      WHEN role::text = 'user' THEN 'member'
      ELSE role::text
    END
  )::public.app_role;
ALTER TABLE public.household_members ALTER COLUMN role SET DEFAULT 'member';
DROP TYPE public.app_role_old CASCADE;

UPDATE public.household_members hm
SET role = 'owner'
FROM public.households h
WHERE hm.household_id = h.id AND hm.user_id = h.owner_id;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
  new_household_name text;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

  new_household_name := NULLIF(trim(NEW.raw_user_meta_data->>'household_name'), '');
  IF new_household_name IS NOT NULL THEN
    INSERT INTO public.households (name, owner_id)
    VALUES (new_household_name, NEW.id)
    RETURNING id INTO new_household_id;

    INSERT INTO public.household_members (household_id, user_id, role, status, created_by)
    VALUES (new_household_id, NEW.id, 'owner', 'active', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_household_member(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE user_id = _user_id
      AND household_id = _household_id
      AND status = 'active'
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
    SELECT 1
    FROM public.household_members
    WHERE user_id = _user_id
      AND household_id = _household_id
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_add_household_items(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE user_id = _user_id
      AND household_id = _household_id
      AND status = 'active'
      AND role IN ('owner', 'admin', 'member')
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_household(_viewer_id uuid, _profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members viewer
    JOIN public.household_members target ON target.household_id = viewer.household_id
    WHERE viewer.user_id = _viewer_id
      AND target.user_id = _profile_user_id
      AND viewer.status = 'active'
      AND target.status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_add_household_items(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_household(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_profile_onboarding_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    NEW.must_complete_profile IS DISTINCT FROM OLD.must_complete_profile
    OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
  ) THEN
    RAISE EXCEPTION 'Onboarding flags can only be changed by the backend';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_onboarding_flags ON public.profiles;
CREATE TRIGGER trg_guard_profile_onboarding_flags
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_onboarding_flags();

CREATE OR REPLACE FUNCTION public.guard_household_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'The household owner cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_household_owner ON public.households;
CREATE TRIGGER trg_guard_household_owner
BEFORE UPDATE ON public.households
FOR EACH ROW EXECUTE FUNCTION public.guard_household_owner();

CREATE OR REPLACE FUNCTION public.guard_household_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  household_owner uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT owner_id INTO household_owner
  FROM public.households
  WHERE id = COALESCE(NEW.household_id, OLD.household_id);

  IF TG_OP = 'INSERT' AND NEW.role = 'owner' AND NEW.user_id <> household_owner THEN
    RAISE EXCEPTION 'Only the household owner can have the owner role';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.user_id = household_owner THEN
    RAISE EXCEPTION 'The household owner cannot be removed or demoted';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.household_id IS DISTINCT FROM OLD.household_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
  ) THEN
    RAISE EXCEPTION 'A membership cannot be moved to another user or household';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.user_id <> household_owner THEN
    RAISE EXCEPTION 'The owner role cannot be assigned';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_household_members ON public.household_members;
CREATE TRIGGER trg_guard_household_members
BEFORE INSERT OR UPDATE OR DELETE ON public.household_members
FOR EACH ROW EXECUTE FUNCTION public.guard_household_member_changes();

CREATE OR REPLACE FUNCTION public.guard_household_id_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'shopping_items' AND NOT EXISTS (
    SELECT 1 FROM public.shopping_lists
    WHERE id = NEW.list_id AND household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'List and item must belong to the same household';
  END IF;

  IF TG_TABLE_NAME = 'item_photos' AND NOT EXISTS (
    SELECT 1 FROM public.shopping_items
    WHERE id = NEW.item_id AND household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'Item and photo must belong to the same household';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_household_consistency ON public.shopping_items;
CREATE TRIGGER trg_items_household_consistency
BEFORE INSERT OR UPDATE ON public.shopping_items
FOR EACH ROW EXECUTE FUNCTION public.guard_household_id_consistency();

DROP TRIGGER IF EXISTS trg_photos_household_consistency ON public.item_photos;
CREATE TRIGGER trg_photos_household_consistency
BEFORE INSERT OR UPDATE ON public.item_photos
FOR EACH ROW EXECUTE FUNCTION public.guard_household_id_consistency();

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

DROP TRIGGER IF EXISTS trg_guard_member_item_updates ON public.shopping_items;
CREATE TRIGGER trg_guard_member_item_updates
BEFORE UPDATE ON public.shopping_items
FOR EACH ROW EXECUTE FUNCTION public.guard_member_item_updates();

CREATE TABLE IF NOT EXISTS public.household_product_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  category text NOT NULL,
  default_unit text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, phrase)
);
ALTER TABLE public.household_product_dictionary ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_product_dictionary TO authenticated;
GRANT ALL ON public.household_product_dictionary TO service_role;

DROP POLICY IF EXISTS "profile_self_read" ON public.profiles;
DROP POLICY IF EXISTS "profile_household_read" ON public.profiles;
DROP POLICY IF EXISTS "profile_self_update" ON public.profiles;
DROP POLICY IF EXISTS "household_member_read" ON public.households;
DROP POLICY IF EXISTS "household_create" ON public.households;
DROP POLICY IF EXISTS "household_owner_update" ON public.households;
DROP POLICY IF EXISTS "household_owner_delete" ON public.households;
DROP POLICY IF EXISTS "members_read" ON public.household_members;
DROP POLICY IF EXISTS "members_insert_self_or_admin" ON public.household_members;
DROP POLICY IF EXISTS "members_update_admin" ON public.household_members;
DROP POLICY IF EXISTS "members_delete_admin_or_self" ON public.household_members;
DROP POLICY IF EXISTS "lists_member_read" ON public.shopping_lists;
DROP POLICY IF EXISTS "lists_member_insert" ON public.shopping_lists;
DROP POLICY IF EXISTS "lists_member_update" ON public.shopping_lists;
DROP POLICY IF EXISTS "lists_admin_delete" ON public.shopping_lists;
DROP POLICY IF EXISTS "items_member_read" ON public.shopping_items;
DROP POLICY IF EXISTS "items_member_insert" ON public.shopping_items;
DROP POLICY IF EXISTS "items_member_update" ON public.shopping_items;
DROP POLICY IF EXISTS "items_admin_delete" ON public.shopping_items;
DROP POLICY IF EXISTS "photos_member_read" ON public.item_photos;
DROP POLICY IF EXISTS "photos_member_insert" ON public.item_photos;
DROP POLICY IF EXISTS "photos_member_delete" ON public.item_photos;
DROP POLICY IF EXISTS "activity_member_read" ON public.activity_log;
DROP POLICY IF EXISTS "activity_member_insert" ON public.activity_log;

CREATE POLICY "profile_self_read" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "profile_household_read" ON public.profiles FOR SELECT TO authenticated
  USING (public.shares_household(auth.uid(), user_id));
CREATE POLICY "profile_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "household_member_read" ON public.households FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), id) OR owner_id = auth.uid());
CREATE POLICY "household_create" ON public.households FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "household_admin_update" ON public.households FOR UPDATE TO authenticated
  USING (public.is_household_admin(auth.uid(), id))
  WITH CHECK (public.is_household_admin(auth.uid(), id));
CREATE POLICY "household_owner_delete" ON public.households FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "members_read" ON public.household_members FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "members_owner_self_insert" ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (SELECT 1 FROM public.households h WHERE h.id = household_id AND h.owner_id = auth.uid())
  );
CREATE POLICY "members_admin_update" ON public.household_members FOR UPDATE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id))
  WITH CHECK (public.is_household_admin(auth.uid(), household_id));
CREATE POLICY "members_admin_delete" ON public.household_members FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "lists_member_read" ON public.shopping_lists FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "lists_contributor_insert" ON public.shopping_lists FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "lists_admin_update" ON public.shopping_lists FOR UPDATE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id))
  WITH CHECK (public.is_household_admin(auth.uid(), household_id));
CREATE POLICY "lists_admin_delete" ON public.shopping_lists FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "items_member_read" ON public.shopping_items FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "items_contributor_insert" ON public.shopping_items FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND added_by = auth.uid());
CREATE POLICY "items_contributor_update" ON public.shopping_items FOR UPDATE TO authenticated
  USING (public.can_add_household_items(auth.uid(), household_id))
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id));
CREATE POLICY "items_admin_delete" ON public.shopping_items FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "photos_member_read" ON public.item_photos FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "photos_contributor_insert" ON public.item_photos FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "photos_owner_or_admin_delete" ON public.item_photos FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_household_admin(auth.uid(), household_id));

CREATE POLICY "activity_member_read" ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "activity_contributor_insert" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND user_id = auth.uid());

CREATE POLICY "dictionary_member_read" ON public.household_product_dictionary FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "dictionary_contributor_insert" ON public.household_product_dictionary FOR INSERT TO authenticated
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "dictionary_contributor_update" ON public.household_product_dictionary FOR UPDATE TO authenticated
  USING (public.can_add_household_items(auth.uid(), household_id))
  WITH CHECK (public.can_add_household_items(auth.uid(), household_id));
CREATE POLICY "dictionary_admin_delete" ON public.household_product_dictionary FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

UPDATE storage.buckets SET public = false WHERE id = 'product-photos';
DROP POLICY IF EXISTS "photos_storage_read" ON storage.objects;
DROP POLICY IF EXISTS "photos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "photos_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "photos_storage_update" ON storage.objects;

CREATE POLICY "photos_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "photos_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.can_add_household_items(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "photos_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.can_add_household_items(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "photos_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.can_add_household_items(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

REVOKE EXECUTE ON FUNCTION public.guard_household_member_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_household_id_consistency() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_member_item_updates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_household_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_onboarding_flags() FROM PUBLIC, anon, authenticated;

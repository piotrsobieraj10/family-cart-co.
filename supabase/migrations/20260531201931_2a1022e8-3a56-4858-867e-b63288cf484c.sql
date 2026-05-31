-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.member_status AS ENUM ('active', 'invited', 'removed');
CREATE TYPE public.list_status AS ENUM ('active', 'shopping', 'done', 'partially_done', 'archived');
CREATE TYPE public.item_status AS ENUM ('active', 'bought', 'unavailable', 'deleted');

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========== profiles ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== households ===========
CREATE TABLE public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_households_updated BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== household_members ===========
CREATE TABLE public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  status public.member_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers (avoid recursion on household_members policies)
CREATE OR REPLACE FUNCTION public.is_household_member(_user_id UUID, _household_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id AND household_id = _household_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(_user_id UUID, _household_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id AND household_id = _household_id
      AND status = 'active' AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_household_ids(_user_id UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.household_members
  WHERE user_id = _user_id AND status = 'active';
$$;

-- =========== shopping_lists ===========
CREATE TABLE public.shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Lista zakupów',
  status public.list_status NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO authenticated;
GRANT ALL ON public.shopping_lists TO service_role;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_lists_updated BEFORE UPDATE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_lists_household ON public.shopping_lists(household_id);

-- =========== shopping_items ===========
CREATE TABLE public.shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  category TEXT,
  note TEXT,
  status public.item_status NOT NULL DEFAULT 'active',
  exact_match_required BOOLEAN NOT NULL DEFAULT false,
  added_by UUID NOT NULL REFERENCES auth.users(id),
  checked_by UUID REFERENCES auth.users(id),
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_items TO authenticated;
GRANT ALL ON public.shopping_items TO service_role;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.shopping_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_items_list ON public.shopping_items(list_id);
CREATE INDEX idx_items_household ON public.shopping_items(household_id);

-- =========== item_photos ===========
CREATE TABLE public.item_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.shopping_items(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  thumbnail_url TEXT,
  preview_url TEXT,
  storage_path TEXT NOT NULL,
  mime_type TEXT DEFAULT 'image/webp',
  width INT,
  height INT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_photos TO authenticated;
GRANT ALL ON public.item_photos TO service_role;
ALTER TABLE public.item_photos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_photos_item ON public.item_photos(item_id);

-- =========== activity_log ===========
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  list_id UUID REFERENCES public.shopping_lists(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.shopping_items(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_household ON public.activity_log(household_id, created_at DESC);

-- =========== RLS POLICIES ===========

-- profiles: users can read own + members of their households; update own
CREATE POLICY "profile_self_read" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "profile_household_read" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.household_members hm1
    JOIN public.household_members hm2 ON hm1.household_id = hm2.household_id
    WHERE hm1.user_id = auth.uid() AND hm2.user_id = profiles.user_id
      AND hm1.status = 'active' AND hm2.status = 'active'
  ));
CREATE POLICY "profile_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- households: members can read; owner can update; authenticated can create
CREATE POLICY "household_member_read" ON public.households FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), id) OR owner_id = auth.uid());
CREATE POLICY "household_create" ON public.households FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "household_owner_update" ON public.households FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_household_admin(auth.uid(), id));
CREATE POLICY "household_owner_delete" ON public.households FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- household_members: members of the household can read; admins can manage; user can read own membership
CREATE POLICY "members_read" ON public.household_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_household_member(auth.uid(), household_id));
CREATE POLICY "members_insert_self_or_admin" ON public.household_members FOR INSERT TO authenticated
  WITH CHECK (
    -- Self-insert as owner of the household
    (user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.households h WHERE h.id = household_id AND h.owner_id = auth.uid()
    ))
    OR public.is_household_admin(auth.uid(), household_id)
  );
CREATE POLICY "members_update_admin" ON public.household_members FOR UPDATE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));
CREATE POLICY "members_delete_admin_or_self" ON public.household_members FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id) OR user_id = auth.uid());

-- shopping_lists
CREATE POLICY "lists_member_read" ON public.shopping_lists FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "lists_member_insert" ON public.shopping_lists FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "lists_member_update" ON public.shopping_lists FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "lists_admin_delete" ON public.shopping_lists FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

-- shopping_items
CREATE POLICY "items_member_read" ON public.shopping_items FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "items_member_insert" ON public.shopping_items FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(auth.uid(), household_id) AND added_by = auth.uid());
CREATE POLICY "items_member_update" ON public.shopping_items FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "items_admin_delete" ON public.shopping_items FOR DELETE TO authenticated
  USING (public.is_household_admin(auth.uid(), household_id));

-- item_photos
CREATE POLICY "photos_member_read" ON public.item_photos FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "photos_member_insert" ON public.item_photos FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(auth.uid(), household_id) AND created_by = auth.uid());
CREATE POLICY "photos_member_delete" ON public.item_photos FOR DELETE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

-- activity_log
CREATE POLICY "activity_member_read" ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "activity_member_insert" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(auth.uid(), household_id) AND user_id = auth.uid());

-- =========== STORAGE BUCKET FOR PHOTOS ===========
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: paths are {household_id}/{item_id}/{file}
CREATE POLICY "photos_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "photos_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "photos_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- =========== REALTIME ===========
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.item_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
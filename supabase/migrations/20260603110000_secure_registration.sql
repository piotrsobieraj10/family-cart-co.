-- Secure self-registration with email confirmation and backend-enforced modes.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.registration_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  label text,
  active boolean NOT NULL DEFAULT true,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_uses IS NULL OR max_uses > 0),
  CHECK (used_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  email text NOT NULL,
  first_name text,
  pending_household_name text,
  registration_source text NOT NULL CHECK (registration_source IN ('self_signup', 'admin_created')),
  code_id uuid REFERENCES public.registration_codes(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumed_at timestamptz,
  household_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_email
  ON public.pending_registrations (lower(email));

ALTER TABLE public.registration_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.registration_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pending_registrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.registration_codes TO service_role;
GRANT ALL ON public.pending_registrations TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  registration_token text;
  registration_token_hash text;
  registration_source_value text;
  pending public.pending_registrations%ROWTYPE;
BEGIN
  registration_token := NULLIF(NEW.raw_user_meta_data->>'registration_token', '');
  registration_source_value := NULLIF(NEW.raw_user_meta_data->>'registration_source', '');

  IF registration_token IS NULL OR registration_source_value IS NULL THEN
    RAISE EXCEPTION 'Registration must be started through the application backend';
  END IF;

  registration_token_hash := encode(extensions.digest(registration_token, 'sha256'), 'hex');

  SELECT *
  INTO pending
  FROM public.pending_registrations
  WHERE token_hash = registration_token_hash
    AND lower(email) = lower(NEW.email)
    AND registration_source = registration_source_value
    AND consumed_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired registration token';
  END IF;

  INSERT INTO public.profiles (user_id, display_name, email, first_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(pending.first_name, ''),
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    NULLIF(pending.first_name, '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email;

  UPDATE public.pending_registrations
  SET consumed_at = now()
  WHERE id = pending.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_email_confirmed(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = _user_id
      AND email_confirmed_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_member(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_email_confirmed(_user_id) AND EXISTS (
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
  SELECT public.is_email_confirmed(_user_id) AND EXISTS (
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
  SELECT public.is_email_confirmed(_user_id) AND EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE user_id = _user_id
      AND household_id = _household_id
      AND status = 'active'
      AND role IN ('owner', 'admin', 'member')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_household_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = _user_id
    AND status = 'active'
    AND public.is_email_confirmed(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.finalize_self_registration(_user_id uuid, _token_hash text)
RETURNS TABLE (household_id uuid, household_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_email text;
  pending public.pending_registrations%ROWTYPE;
  new_household_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'This function can only be called by the backend';
  END IF;

  SELECT email
  INTO auth_email
  FROM auth.users
  WHERE id = _user_id
    AND email_confirmed_at IS NOT NULL;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'email_not_confirmed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE user_id = _user_id
      AND status = 'active'
  ) THEN
    RETURN;
  END IF;

  SELECT *
  INTO pending
  FROM public.pending_registrations
  WHERE token_hash = _token_hash
    AND lower(email) = lower(auth_email)
    AND registration_source = 'self_signup'
    AND consumed_at IS NOT NULL
    AND household_created_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR NULLIF(trim(pending.pending_household_name), '') IS NULL THEN
    RAISE EXCEPTION 'pending_registration_not_found';
  END IF;

  INSERT INTO public.households (name, owner_id)
  VALUES (trim(pending.pending_household_name), _user_id)
  RETURNING id INTO new_household_id;

  INSERT INTO public.household_members (household_id, user_id, role, status, created_by)
  VALUES (new_household_id, _user_id, 'owner', 'active', _user_id);

  UPDATE public.pending_registrations
  SET household_created_at = now()
  WHERE id = pending.id;

  RETURN QUERY SELECT new_household_id, trim(pending.pending_household_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_email_confirmed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_self_registration(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_self_registration(uuid, text) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "household_member_read" ON public.households;
DROP POLICY IF EXISTS "household_create" ON public.households;

CREATE POLICY "household_member_read" ON public.households FOR SELECT TO authenticated
  USING (
    public.is_household_member(auth.uid(), id)
    OR (owner_id = auth.uid() AND public.is_email_confirmed(auth.uid()))
  );

CREATE POLICY "household_create" ON public.households FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.is_email_confirmed(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.is_email_confirmed(uuid) FROM PUBLIC, anon;

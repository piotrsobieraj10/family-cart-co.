-- Push notifications for Family Cart PWA.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
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
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_household
  ON public.push_subscriptions (household_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_enabled
  ON public.push_subscriptions (user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_push_notification_log_household
  ON public.push_notification_log (household_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_push_subscription_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Push subscription user_id must match authenticated user';
  END IF;

  IF NOT public.is_household_member(auth.uid(), NEW.household_id) THEN
    RAISE EXCEPTION 'User must be an active member of the household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_subscription_household ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscription_household
BEFORE INSERT OR UPDATE ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.guard_push_subscription_household();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT ON public.push_notification_log TO authenticated;
GRANT ALL ON public.push_subscriptions, public.push_notification_log TO service_role;

CREATE POLICY "push_subscriptions_own_read" ON public.push_subscriptions
FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.is_household_member(auth.uid(), household_id));

CREATE POLICY "push_subscriptions_own_insert" ON public.push_subscriptions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_household_member(auth.uid(), household_id));

CREATE POLICY "push_subscriptions_own_update" ON public.push_subscriptions
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.is_household_member(auth.uid(), household_id))
WITH CHECK (user_id = auth.uid() AND public.is_household_member(auth.uid(), household_id));

CREATE POLICY "push_subscriptions_own_delete" ON public.push_subscriptions
FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.is_household_member(auth.uid(), household_id));

CREATE POLICY "push_log_admin_read" ON public.push_notification_log
FOR SELECT TO authenticated
USING (public.is_household_admin(auth.uid(), household_id));

-- Beta hardening for public self-signup:
--   1. Self sign-ups can no longer choose their platform role. The signup trigger
--      now forces 'standard' for self-service registrations and only honors an
--      elevated role (admin/god) when the account was created via an admin invite
--      (auth.users.invited_at is set by inviteUserByEmail).
--   2. Track when our own "welcome" email has been sent so it goes out exactly once.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Signup trigger: ignore client-supplied role for self sign-ups
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  user_role text;
  is_invite boolean;
BEGIN
  -- Admin-created accounts go through inviteUserByEmail, which stamps invited_at.
  -- Anyone hitting the public signup form has invited_at = NULL.
  is_invite := NEW.invited_at IS NOT NULL;

  user_role := coalesce(NEW.raw_user_meta_data->>'role', 'standard');

  -- Self sign-ups are always 'standard' regardless of what the client posted.
  IF NOT is_invite THEN
    user_role := 'standard';
  END IF;

  -- Defense in depth: reject anything outside the known platform roles.
  IF user_role IS NULL OR user_role NOT IN ('guest', 'standard', 'admin', 'god') THEN
    user_role := 'standard';
  END IF;

  INSERT INTO public.users (id, email, full_name, role, platform_elevation)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', ''),
    user_role,
    CASE
      WHEN user_role = ANY (ARRAY['admin'::text, 'god'::text]) THEN user_role
      ELSE NULL
    END
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Welcome email bookkeeping
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

COMMENT ON COLUMN public.users.welcome_email_sent_at IS
  'When the one-time platform welcome email was sent (NULL = not yet sent).';

-- Idempotently claim the right to send the welcome email for the current user.
-- Returns true exactly once (the first call), so the app can send the email
-- without ever double-sending even if the confirm route is hit twice.
CREATE OR REPLACE FUNCTION public.claim_welcome_email()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.users
    SET welcome_email_sent_at = now()
    WHERE id = auth.uid()
      AND welcome_email_sent_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.claim_welcome_email() IS
  'First call for the authenticated user stamps welcome_email_sent_at and returns true; later calls return false.';

REVOKE ALL ON FUNCTION public.claim_welcome_email() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_welcome_email() TO authenticated;

COMMIT;

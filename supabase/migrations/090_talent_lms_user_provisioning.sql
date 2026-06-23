-- Provision a learner's TalentLMS account as soon as they confirm their email,
-- so the account exists well before any training-path enrollment. We persist the
-- provisioning outcome on public.users so the app can surface a "Try again" /
-- "contact your admin" banner when creation fails.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Provisioning state on public.users
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS talent_lms_provision_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS talent_lms_provision_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS talent_lms_provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS talent_lms_provision_last_error text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_talent_lms_provision_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_talent_lms_provision_status_check
  CHECK (talent_lms_provision_status IN ('pending', 'provisioned', 'failed'));

COMMENT ON COLUMN public.users.talent_lms_provision_status IS
  'TalentLMS account provisioning state: pending (not attempted / feature off), provisioned (account exists), failed (creation errored).';
COMMENT ON COLUMN public.users.talent_lms_provision_attempts IS
  'Number of failed TalentLMS account provisioning attempts (reset implicitly once provisioned).';
COMMENT ON COLUMN public.users.talent_lms_provisioned_at IS
  'When the learner''s TalentLMS account was confirmed to exist (NULL = not yet).';
COMMENT ON COLUMN public.users.talent_lms_provision_last_error IS
  'Last TalentLMS provisioning error message (NULL once provisioned).';

-- ---------------------------------------------------------------------------
-- 2. Record a provisioning attempt outcome for the current user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_talent_lms_provision_result(
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS TABLE (status text, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.users u
      SET talent_lms_provision_status = 'provisioned',
          talent_lms_provisioned_at = now(),
          talent_lms_provision_last_error = NULL
      WHERE u.id = auth.uid();
  ELSE
    UPDATE public.users u
      SET talent_lms_provision_status = 'failed',
          talent_lms_provision_attempts = u.talent_lms_provision_attempts + 1,
          talent_lms_provision_last_error = left(coalesce(p_error, ''), 1000)
      WHERE u.id = auth.uid();
  END IF;

  RETURN QUERY
    SELECT u.talent_lms_provision_status, u.talent_lms_provision_attempts
    FROM public.users u
    WHERE u.id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.record_talent_lms_provision_result(boolean, text) IS
  'Records the outcome of a TalentLMS account provisioning attempt for the authenticated user and returns the resulting status/attempts.';

REVOKE ALL ON FUNCTION public.record_talent_lms_provision_result(boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_talent_lms_provision_result(boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Expose provisioning status on the session profile RPC
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_session_user_profile();

CREATE FUNCTION public.get_session_user_profile()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  visible boolean,
  last_active_organization_id uuid,
  current_user_training_id uuid,
  current_certification text,
  default_start_path text,
  talent_lms_provision_status text,
  talent_lms_provision_attempts integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.role,
    u.visible,
    u.last_active_organization_id,
    u.current_user_training_id,
    u.current_certification::text AS current_certification,
    u.default_start_path,
    u.talent_lms_provision_status,
    u.talent_lms_provision_attempts
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_session_user_profile() IS
  'Returns at most one row: the caller''s public.users record (auth.uid()), regardless of users RLS.';

REVOKE ALL ON FUNCTION public.get_session_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO service_role;

COMMIT;

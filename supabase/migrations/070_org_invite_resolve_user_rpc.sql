-- ============================================================================
-- DEPLOYMENT: Apply with other migrations (e.g. `npx supabase db push`).
-- Org invite linking uses these RPCs with the normal user session so supervisors
-- do not need SUPABASE_SERVICE_ROLE_KEY for that path.
-- ============================================================================
--
-- Resolve / verify users for org invite using the caller session (no service role).
-- Email invites for brand-new users still require SUPABASE_SERVICE_ROLE_KEY + auth.admin.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_supervisor_invite_resolve_user_id(
  p_organization_id uuid,
  p_email text
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_id uuid;
BEGIN
  IF NOT (
    public.auth_is_org_supervisor(p_organization_id)
    OR public.auth_is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_email := btrim(COALESCE(p_email, ''));
  IF v_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.id INTO v_id
  FROM public.users u
  WHERE u.email IS NOT NULL
    AND lower(trim(both from u.email::text)) = lower(v_email)
  LIMIT 1;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.org_supervisor_invite_resolve_user_id(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_supervisor_invite_resolve_user_id(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_supervisor_invite_resolve_user_id(uuid, text) TO service_role;

COMMENT ON FUNCTION public.org_supervisor_invite_resolve_user_id(uuid, text) IS
  'Org supervisor or platform admin: return public.users.id for email (case-insensitive), or NULL.';


CREATE OR REPLACE FUNCTION public.org_supervisor_invite_verify_linked_user(
  p_organization_id uuid,
  p_user_id uuid,
  p_email text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT (
    public.auth_is_org_supervisor(p_organization_id)
    OR public.auth_is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_email := btrim(COALESCE(p_email, ''));
  IF v_email = '' OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.email IS NOT NULL
      AND lower(trim(both from u.email::text)) = lower(v_email)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.org_supervisor_invite_verify_linked_user(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_supervisor_invite_verify_linked_user(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_supervisor_invite_verify_linked_user(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.org_supervisor_invite_verify_linked_user(uuid, uuid, text) IS
  'Org supervisor or platform admin: true if user exists and email matches (case-insensitive).';

COMMIT;

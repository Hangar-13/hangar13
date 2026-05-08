-- ============================================================================
-- DEPLOYMENT: You MUST apply this migration before org member invite search /
-- email checks work. From repo root, typically:
--   npx supabase db push
--   or: npx supabase migration up
-- Without it, RPCs org_supervisor_search_directory_users and
-- org_supervisor_directory_email_available will be missing (runtime errors).
-- ============================================================================
--
-- Directory search + email availability for org invite UI (supervisors cannot SELECT
-- non–co-member users under normal RLS).

BEGIN;

CREATE OR REPLACE FUNCTION public.org_supervisor_search_directory_users(
  p_organization_id uuid,
  p_query text,
  p_limit int DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int;
  v_pat text;
  v_q text;
BEGIN
  IF NOT (
    public.auth_is_org_supervisor(p_organization_id)
    OR public.auth_is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_limit := GREATEST(1, LEAST(30, COALESCE(p_limit, 15)));
  v_q := btrim(COALESCE(p_query, ''));

  IF length(v_q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  v_pat := '%' || v_q || '%';

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'email', t.email,
          'full_name', t.full_name
        )
        ORDER BY t.ord, t.full_name NULLS LAST, t.email
      )
      FROM (
        SELECT
          u.id,
          u.email,
          u.full_name,
          CASE
            WHEN lower(trim(both from u.email::text)) = lower(v_q) THEN 0
            WHEN lower(trim(both from u.email::text)) LIKE lower(v_q) || '%' THEN 1
            ELSE 2
          END AS ord
        FROM public.users u
        WHERE u.visible = true
          AND u.email IS NOT NULL
          AND btrim(u.email::text) <> ''
          AND (
            u.email ILIKE v_pat
            OR COALESCE(u.full_name, '') ILIKE v_pat
          )
        ORDER BY ord, u.full_name NULLS LAST, u.email
        LIMIT v_limit
      ) t
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.org_supervisor_search_directory_users(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_supervisor_search_directory_users(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_supervisor_search_directory_users(uuid, text, int) TO service_role;

COMMENT ON FUNCTION public.org_supervisor_search_directory_users(uuid, text, int) IS
  'Org supervisors (or platform admins): search visible directory users by email/name fragment for member invite UI.';


CREATE OR REPLACE FUNCTION public.org_supervisor_directory_email_available(
  p_organization_id uuid,
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
  IF v_email = '' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.email IS NOT NULL
      AND lower(trim(both from u.email::text)) = lower(v_email)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.org_supervisor_directory_email_available(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_supervisor_directory_email_available(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_supervisor_directory_email_available(uuid, text) TO service_role;

COMMENT ON FUNCTION public.org_supervisor_directory_email_available(uuid, text) IS
  'Org supervisors (or platform admins): true if no public.users row uses this email (case-insensitive).';

COMMIT;

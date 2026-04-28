-- Paginated user list for the god "Manage Users" page (search: email, name, or organization name).

BEGIN;

CREATE OR REPLACE FUNCTION public.god_list_users_paginated(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int;
  v_offset int;
  v_total bigint;
  v_has_search boolean;
  v_pat text;
  v_rows jsonb;
BEGIN
  IF NOT public.auth_is_system_god() THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  v_limit := GREATEST(1, LEAST(100, COALESCE(p_limit, 20)));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  v_has_search := p_search IS NOT NULL AND btrim(p_search) <> '';
  v_pat := '%' || btrim(p_search) || '%';

  WITH matching AS (
    SELECT u.id
    FROM public.users u
    WHERE
      NOT v_has_search
      OR (u.email ILIKE v_pat)
      OR (COALESCE(u.full_name, '') ILIKE v_pat)
      OR EXISTS (
        SELECT 1
        FROM public.user_organizations uo2
        JOIN public.organizations o2 ON o2.id = uo2.organization_id
        WHERE uo2.user_id = u.id
          AND o2.name ILIKE v_pat
      )
  )
  SELECT count(*)::bigint INTO v_total FROM matching;

  SELECT coalesce((
    WITH matching AS (
      SELECT uu.id
      FROM public.users uu
      WHERE
        NOT v_has_search
        OR (uu.email ILIKE v_pat)
        OR (COALESCE(uu.full_name, '') ILIKE v_pat)
        OR EXISTS (
          SELECT 1
          FROM public.user_organizations uo2
          JOIN public.organizations o2 ON o2.id = uo2.organization_id
          WHERE uo2.user_id = uu.id
            AND o2.name ILIKE v_pat
        )
    ),
    paged AS (
      SELECT m.id
      FROM matching m
      JOIN public.users u0 ON u0.id = m.id
      ORDER BY u0.email ASC
      LIMIT v_limit OFFSET v_offset
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'role', u.role,
        'created_at', u.created_at,
        'organization_names', (
          SELECT string_agg(sq.name, ', ' ORDER BY sq.name)
          FROM (
            SELECT DISTINCT o.name
            FROM public.user_organizations uo
            JOIN public.organizations o ON o.id = uo.organization_id
            WHERE uo.user_id = u.id
          ) sq
        ),
        'lead_organization_names', (
          SELECT string_agg(o.name, ', ' ORDER BY o.name)
          FROM public.organizations o
          WHERE o.lead_user_id = u.id
        )
      )
      ORDER BY u.email ASC
    )
    FROM paged p
    JOIN public.users u ON u.id = p.id
  ), '[]'::jsonb)
  INTO v_rows;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.god_list_users_paginated(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.god_list_users_paginated(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.god_list_users_paginated(text, int, int) TO service_role;

COMMENT ON FUNCTION public.god_list_users_paginated(text, int, int) IS
  'God dashboard: list users with search and pagination. Caller must be system role god.';

COMMIT;

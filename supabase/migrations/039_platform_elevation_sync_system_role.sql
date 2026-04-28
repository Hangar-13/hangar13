-- Effective system role = max(org memberships) for student/mentor/manager/org-admin, unless
-- platform_elevation (god|admin) pins a higher platform role.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Platform elevation: explicit system god/admin (not downgraded by org changes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS platform_elevation text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_platform_elevation_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_platform_elevation_check CHECK (
    platform_elevation IS NULL
    OR platform_elevation = ANY (ARRAY['admin'::text, 'god'::text])
  );

COMMENT ON COLUMN public.users.platform_elevation IS
  'When god or platform admin, pins users.role; NULL means org memberships drive users.role.';

-- Backfill: god always elevated; platform admin is role=admin with no org-level admin row
UPDATE public.users SET platform_elevation = 'god' WHERE role = 'god'::text;

UPDATE public.users u
SET platform_elevation = 'admin'
WHERE u.role = 'admin'::text
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    WHERE uo.user_id = u.id
      AND uo.role = 'admin'::text
  );

-- ---------------------------------------------------------------------------
-- 2) RLS: system admin or god can read all users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = ANY (ARRAY['admin'::text, 'god'::text])
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_platform_admin() TO service_role;

COMMENT ON FUNCTION public.auth_is_platform_admin() IS
  'True if caller is system role admin or god (definer read; use in RLS and RPCs).';

DROP POLICY IF EXISTS "System god can read all user rows" ON public.users;

CREATE POLICY "System admin or god can read all user rows"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.auth_is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3) Recompute users.role from orgs + platform_elevation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_effective_user_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pe text;
  v_cur text;
  v_max int;
  v_from_org text;
BEGIN
  SELECT u.platform_elevation, u.role
  INTO v_pe, v_cur
  FROM public.users u
  WHERE u.id = p_user_id;

  IF v_pe = 'god'::text THEN
    UPDATE public.users SET role = 'god' WHERE id = p_user_id;
    RETURN;
  END IF;

  IF v_pe = 'admin'::text THEN
    UPDATE public.users SET role = 'admin' WHERE id = p_user_id;
    RETURN;
  END IF;

  SELECT coalesce(
    max(
      CASE uo.role
        WHEN 'student'::text THEN 1
        WHEN 'mentor'::text THEN 2
        WHEN 'manager'::text THEN 3
        WHEN 'admin'::text THEN 4
        ELSE 1
      END
    ),
    0
  ) INTO v_max
  FROM public.user_organizations uo
  WHERE uo.user_id = p_user_id;

  -- Keep explicit guest with no org memberships; joining an org re-promotes from max(org role)
  IF v_cur = 'guest'::text AND v_max = 0 THEN
    RETURN;
  END IF;

  IF v_max = 0 THEN
    v_from_org := 'student';
  ELSE
    v_from_org := CASE v_max
      WHEN 4 THEN 'admin'
      WHEN 3 THEN 'manager'
      WHEN 2 THEN 'mentor'
      ELSE 'student'
    END;
  END IF;

  UPDATE public.users SET role = v_from_org WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_effective_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_effective_user_role(uuid) TO service_role;

COMMENT ON FUNCTION public.recompute_effective_user_role(uuid) IS
  'Sets users.role from max(org roles) or honors platform_elevation (admin/god). Service-role only.';

CREATE OR REPLACE FUNCTION public.trg_recompute_user_role_from_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := coalesce(NEW.user_id, OLD.user_id);
  PERFORM public.recompute_effective_user_role(v_uid);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_user_role_from_membership ON public.user_organizations;
CREATE TRIGGER trg_recompute_user_role_from_membership
  AFTER INSERT OR UPDATE OR DELETE ON public.user_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recompute_user_role_from_membership();

-- One-shot: align all users.role
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN select id from public.users LOOP
    PERFORM public.recompute_effective_user_role(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) God user list: allow system admin, not only god
-- ---------------------------------------------------------------------------
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
  IF NOT public.auth_is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  v_limit := greatest(1, least(100, coalesce(p_limit, 20)));
  v_offset := greatest(0, coalesce(p_offset, 0));

  v_has_search := p_search is not null and btrim(p_search) <> '';
  v_pat := '%' || btrim(p_search) || '%';

  WITH matching AS (
    select u.id
    FROM public.users u
    WHERE
      not v_has_search
      or (u.email ilike v_pat)
      or (coalesce(u.full_name, '') ilike v_pat)
      or exists (
        select 1
        from public.user_organizations uo2
        join public.organizations o2 on o2.id = uo2.organization_id
        where uo2.user_id = u.id
          and o2.name ilike v_pat
      )
  )
  select count(*)::bigint into v_total from matching;

  select coalesce((
    with matching as (
      select uu.id
      from public.users uu
      where
        not v_has_search
        or (uu.email ilike v_pat)
        or (coalesce(uu.full_name, '') ilike v_pat)
        or exists (
          select 1
          from public.user_organizations uo2
          join public.organizations o2 on o2.id = uo2.organization_id
          where uo2.user_id = uu.id
            and o2.name ilike v_pat
        )
    ),
    paged as (
      select m.id
      from matching m
      join public.users u0 on u0.id = m.id
      order by u0.email asc
      limit v_limit offset v_offset
    )
    select jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'role', u.role,
        'created_at', u.created_at,
        'organizations', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'name', sub.name,
                'is_lead', sub.is_lead
              )
              order by sub.name
            ),
            '[]'::jsonb
          )
          from (
            select
              o.name,
              (o.lead_user_id is not null and o.lead_user_id = u.id) as is_lead
            from public.user_organizations uo
            join public.organizations o on o.id = uo.organization_id
            where uo.user_id = u.id
          ) sub
        )
      )
      order by u.email asc
    )
    from paged p
    join public.users u on u.id = p.id
  ), '[]'::jsonb) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.god_list_users_paginated(text, int, int) IS
  'List users (admin / god). organizations: [{name, is_lead}].';

COMMIT;

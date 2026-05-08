-- Organization "lead" is a membership role (user_organizations.role = lead), above supervisor.
-- organizations.lead_user_id is maintained by trigger from that role (at most one lead per org).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Role constraint + backfill from legacy lead_user_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_organizations
  DROP CONSTRAINT IF EXISTS user_organizations_role_check;

ALTER TABLE public.user_organizations
  ADD CONSTRAINT user_organizations_role_check CHECK (
    role = ANY (
      ARRAY[
        'student'::text,
        'mentor'::text,
        'manager'::text,
        'supervisor'::text,
        'lead'::text
      ]
    )
  );

COMMENT ON COLUMN public.user_organizations.role IS
  'Role within the organization: student, mentor, manager, supervisor, lead (lead is above supervisor).';

UPDATE public.user_organizations uo
SET role = 'lead'
FROM public.organizations o
WHERE o.id = uo.organization_id
  AND o.lead_user_id IS NOT NULL
  AND uo.user_id = o.lead_user_id
  AND uo.role IS DISTINCT FROM 'lead';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_organizations_one_lead_per_org
  ON public.user_organizations (organization_id)
  WHERE role = 'lead';

-- ---------------------------------------------------------------------------
-- 2) Keep organizations.lead_user_id in sync
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_organization_lead_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := coalesce(NEW.organization_id, OLD.organization_id);
  UPDATE public.organizations o
  SET lead_user_id = sub.uid
  FROM (
    SELECT uo.user_id AS uid
    FROM public.user_organizations uo
    WHERE uo.organization_id = v_org
      AND uo.role = 'lead'
    ORDER BY uo.user_id
    LIMIT 1
  ) sub
  WHERE o.id = v_org;

  UPDATE public.organizations o
  SET lead_user_id = NULL
  WHERE o.id = v_org
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_organizations uo
      WHERE uo.organization_id = v_org
        AND uo.role = 'lead'
    );

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_organization_lead_user_id ON public.user_organizations;
CREATE TRIGGER trg_sync_organization_lead_user_id
  AFTER INSERT OR UPDATE OF role, organization_id OR DELETE
  ON public.user_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_organization_lead_user_id();

-- ---------------------------------------------------------------------------
-- 3) Do not DELETE the organization's only lead while other members remain
--    (demotions / transfers are validated in application code).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_organizations_enforce_remaining_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_members int;
  v_other_leads int;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'lead' THEN
    SELECT count(*)::int
    INTO v_remaining_members
    FROM public.user_organizations uo
    WHERE uo.organization_id = OLD.organization_id
      AND uo.user_id IS DISTINCT FROM OLD.user_id;
    SELECT count(*)::int
    INTO v_other_leads
    FROM public.user_organizations uo
    WHERE uo.organization_id = OLD.organization_id
      AND uo.role = 'lead'
      AND uo.user_id IS DISTINCT FROM OLD.user_id;
    IF v_remaining_members > 0 AND v_other_leads = 0 THEN
      RAISE EXCEPTION 'organization_must_keep_lead'
        USING ERRCODE = '23514',
          HINT = 'Promote another member to lead before removing the current lead.';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_organizations_enforce_remaining_lead ON public.user_organizations;
CREATE TRIGGER trg_user_organizations_enforce_remaining_lead
  BEFORE DELETE
  ON public.user_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.user_organizations_enforce_remaining_lead();

-- One-shot: align lead_user_id from memberships
UPDATE public.organizations o
SET lead_user_id = sub.uid
FROM (
  SELECT uo.organization_id AS org_id, uo.user_id AS uid
  FROM public.user_organizations uo
  WHERE uo.role = 'lead'
) sub
WHERE o.id = sub.org_id
  AND (o.lead_user_id IS DISTINCT FROM sub.uid);

UPDATE public.organizations o
SET lead_user_id = NULL
WHERE o.lead_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    WHERE uo.organization_id = o.id
      AND uo.user_id = o.lead_user_id
      AND uo.role = 'lead'
  );

-- ---------------------------------------------------------------------------
-- 4) RLS helpers: lead has supervisor-tier (and manager-co-view) access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_org_supervisor(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = p_org_id
      AND uo.role = ANY (ARRAY['supervisor'::text, 'lead'::text])
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_org_manager_or_supervisor(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = p_org_id
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text, 'lead'::text])
  );
$$;

COMMENT ON FUNCTION public.auth_is_org_supervisor(uuid) IS
  'True if caller is organization supervisor or lead in the given organization.';
COMMENT ON FUNCTION public.auth_is_org_manager_or_supervisor(uuid) IS
  'True if caller has manager, supervisor, or lead role in the given organization.';

DROP POLICY IF EXISTS "Org managers and supervisors view co-member profiles" ON public.users;
CREATE POLICY "Org managers and supervisors view co-member profiles"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_organizations my_uo
      INNER JOIN public.user_organizations peer_uo
        ON peer_uo.organization_id = my_uo.organization_id
       AND peer_uo.user_id = users.id
      WHERE my_uo.user_id = auth.uid()
        AND my_uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text, 'lead'::text])
    )
  );

CREATE OR REPLACE FUNCTION public.auth_org_has_manager_plus(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = p_org_id
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text, 'lead'::text])
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_org_mentor_plus_for_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    INNER JOIN public.courses c ON c.organization_id = uo.organization_id
    WHERE c.id = p_course_id
      AND uo.user_id = auth.uid()
      AND uo.role = ANY (
        ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mentor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (
        ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_manager_or_god()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text, 'lead'::text])
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_has_manager_or_god_in_any_org()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_can_manage_orgs_and_memberships();
$$;

-- Catalog policies (mentor+): include lead alongside supervisor
DROP POLICY IF EXISTS "Org mentors and above can manage courses" ON public.courses;
CREATE POLICY "Org mentors and above can manage courses"
  ON public.courses
  FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = courses.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = courses.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ));

DROP POLICY IF EXISTS "Org mentors and above can manage modules" ON public.modules;
CREATE POLICY "Org mentors and above can manage modules"
  ON public.modules
  FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      JOIN public.courses c ON c.id = modules.course_id
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = c.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      JOIN public.courses c ON c.id = modules.course_id
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = c.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ));

DROP POLICY IF EXISTS "Org mentors and above can manage lessons" ON public.lessons;
CREATE POLICY "Org mentors and above can manage lessons"
  ON public.lessons
  FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      JOIN public.modules m ON m.id = lessons.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = c.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      JOIN public.modules m ON m.id = lessons.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = c.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ));

DROP POLICY IF EXISTS "Org mentors and above can manage training_paths" ON public.training_paths;
CREATE POLICY "Org mentors and above can manage training_paths"
  ON public.training_paths
  FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = training_paths.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = training_paths.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ));

DROP POLICY IF EXISTS "Org mentors and above can manage training_path_items" ON public.training_path_items;
CREATE POLICY "Org mentors and above can manage training_path_items"
  ON public.training_path_items
  FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      JOIN public.training_paths tp ON tp.id = training_path_items.training_path_id
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = tp.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      JOIN public.training_paths tp ON tp.id = training_path_items.training_path_id
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = tp.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ));

-- ---------------------------------------------------------------------------
-- 5) God user list: is_lead from membership role
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
    SELECT u.id
    FROM public.users u
    WHERE u.visible = true
      AND (
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
  )
  SELECT count(*)::bigint INTO v_total FROM matching;

  SELECT coalesce((
    WITH matching AS (
      SELECT uu.id
      FROM public.users uu
      WHERE uu.visible = true
        AND (
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
        )
    ),
    paged AS (
      SELECT m.id
      FROM matching m
      JOIN public.users u0 ON u0.id = m.id
      ORDER BY u0.email ASC NULLS LAST
      LIMIT v_limit OFFSET v_offset
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'role', u.role,
        'created_at', u.created_at,
        'organizations', (
          SELECT coalesce(
            jsonb_agg(
              jsonb_build_object(
                'name', sub.name,
                'is_lead', sub.is_lead
              )
              ORDER BY sub.name
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT
              o.name,
              (uo.role = 'lead') AS is_lead
            FROM public.user_organizations uo
            JOIN public.organizations o ON o.id = uo.organization_id
            WHERE uo.user_id = u.id
          ) sub
        )
      )
      ORDER BY u.email ASC NULLS LAST
    )
    FROM paged p
    JOIN public.users u ON u.id = p.id
  ), '[]'::jsonb) INTO v_rows;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

COMMIT;

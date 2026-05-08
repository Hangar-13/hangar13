-- System roles (users.role): guest, standard, admin, god — platform tier only.
-- Org roles (user_organizations.role): student, mentor, manager, supervisor (was admin).
-- Stops mirroring max(org role) into users.role; mentor/manager UX uses active org context in app.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Organization roles: admin → supervisor
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_organizations
  DROP CONSTRAINT IF EXISTS user_organizations_role_check;

UPDATE public.user_organizations SET role = 'supervisor' WHERE role = 'admin';

ALTER TABLE public.user_organizations
  ADD CONSTRAINT user_organizations_role_check CHECK (
    role = ANY (
      ARRAY[
        'student'::text,
        'mentor'::text,
        'manager'::text,
        'supervisor'::text
      ]
    )
  );

COMMENT ON COLUMN public.user_organizations.role IS
  'Role within the organization: student, mentor, manager, supervisor.';

-- ---------------------------------------------------------------------------
-- 2) System roles on users: collapse trainee personas into standard
-- ---------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE public.users
SET role = 'standard'
WHERE role = ANY (ARRAY['student'::text, 'mentor'::text, 'manager'::text]);

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role = ANY (ARRAY['guest'::text, 'standard'::text, 'admin'::text, 'god'::text])
  );

ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'standard';

COMMENT ON COLUMN public.users.role IS
  'Platform tier: guest, standard (normal authenticated), admin, god. Not org mentorship level.';

-- ---------------------------------------------------------------------------
-- 3) Remember last active organization (app + cookie)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_organization_id uuid
    REFERENCES public.organizations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_active_organization_id
  ON public.users (last_active_organization_id);

-- ---------------------------------------------------------------------------
-- 4) Signup trigger: only platform roles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  user_role text;
BEGIN
  user_role := coalesce(NEW.raw_user_meta_data->>'role', 'standard');
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

-- Align elevation for existing admin/god rows (invite users created before elevation column backfill).
UPDATE public.users
SET platform_elevation = role
WHERE role = ANY (ARRAY['admin'::text, 'god'::text])
  AND platform_elevation IS NULL;

-- ---------------------------------------------------------------------------
-- 5) Recompute users.role: platform elevation only (no org max)
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

  IF v_cur = 'guest'::text THEN
    RETURN;
  END IF;

  UPDATE public.users SET role = 'standard' WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.recompute_effective_user_role(uuid) IS
  'Sets users.role from platform_elevation (admin/god) or standard; preserves explicit guest.';

-- ---------------------------------------------------------------------------
-- 6) Platform elevation backfill comment only — historical rows unchanged.
--    Drop stale trigger behavior by reusing same trigger (already attached).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.users LOOP
    PERFORM public.recompute_effective_user_role(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7) RLS helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_has_manager_or_god_in_any_org()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text])
  );
$$;

COMMENT ON FUNCTION public.auth_has_manager_or_god_in_any_org() IS
  'Platform admin/god, or org manager/supervisor in any organization.';

CREATE OR REPLACE FUNCTION public.is_mentor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (
        ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
    SELECT 1
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text])
  );
$$;

-- Catalog write policies (org-scoped): supervisor replaces admin
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
        )
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = courses.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
        )
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = training_paths.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
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
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
        )
    )
  ));

-- Visibility helpers from 044
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
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text])
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
        ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text]
      )
  );
$$;

-- Users policies: system roles no longer encode mentor/student split
DROP POLICY IF EXISTS "Gods can update manager roles" ON public.users;
DROP POLICY IF EXISTS "Managers can update student and mentor roles" ON public.users;
DROP POLICY IF EXISTS "Mentors can view student profiles" ON public.users;

CREATE POLICY "Platform admins may update users"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Mentors can view assigned mentee profiles"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_trainings ut
      WHERE ut.user_id = users.id
        AND ut.mentor_id = auth.uid()
    )
  );

COMMIT;

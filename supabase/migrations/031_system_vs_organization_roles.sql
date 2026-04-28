-- System roles (public.users.role): guest, student, mentor, manager, admin, god
-- Organization roles (public.user_organizations.role): student, mentor, manager, admin
-- Remove auto-sync from org memberships to users.role (they are independent).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Organization roles: replace legacy 'god' with 'admin'
-- Must drop CHECK before UPDATE: old check allows 'god' but not 'admin'
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_organizations
    DROP CONSTRAINT IF EXISTS user_organizations_role_check;

UPDATE public.user_organizations SET role = 'admin' WHERE role = 'god';

ALTER TABLE public.user_organizations
    ADD CONSTRAINT user_organizations_role_check CHECK (
        role = ANY (ARRAY[
            'student'::text,
            'mentor'::text,
            'manager'::text,
            'admin'::text
        ])
    );

-- ---------------------------------------------------------------------------
-- 2. System roles on users: add guest + admin (keep existing values valid)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check CHECK (
        role = ANY (ARRAY[
            'guest'::text,
            'student'::text,
            'mentor'::text,
            'manager'::text,
            'admin'::text,
            'god'::text
        ])
    );

ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'student';

-- ---------------------------------------------------------------------------
-- 3. Stop syncing users.role from organization memberships
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_users_role_after_membership ON public.user_organizations;
DROP FUNCTION IF EXISTS public.sync_users_role_from_memberships();

-- ---------------------------------------------------------------------------
-- 4. Signup: only allow system roles in CHECK; invalid metadata -> student
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
    user_role text;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
    IF user_role IS NULL OR user_role NOT IN (
        'guest', 'student', 'mentor', 'manager', 'admin', 'god'
    ) THEN
        user_role := 'student';
    END IF;

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role
    );

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS helper: system god OR org manager/admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_has_manager_or_god_in_any_org()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'god'::text
  )
  OR EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (ARRAY['manager'::text, 'admin'::text])
  );
$$;

COMMENT ON FUNCTION public.auth_has_manager_or_god_in_any_org() IS
  'True if caller has system role god, or org manager/admin in any organization.';

-- ---------------------------------------------------------------------------
-- 6. Catalog write policies: org roles mentor, manager, admin (not god)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Org mentors and above can manage courses" ON public.courses;
CREATE POLICY "Org mentors and above can manage courses"
    ON public.courses
    FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = courses.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = courses.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
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
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.courses c ON c.id = modules.course_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = c.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
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
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.modules m ON m.id = lessons.module_id
        JOIN public.courses c ON c.id = m.course_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = c.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
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
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = training_paths.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
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
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.training_paths tp ON tp.id = training_path_items.training_path_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = tp.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
      )
    ));

COMMIT;

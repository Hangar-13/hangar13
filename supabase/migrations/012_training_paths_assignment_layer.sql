-- Training paths: separate assignment layer (references only; no lesson/module/course content).
-- Prerequisite: public.courses exists (migration 011). If an older migration renamed courses
-- to training_paths, reset the database before applying this migration.
-- Content hierarchy unchanged: courses → modules → lessons.

-- ---------------------------------------------------------------------------
-- 1. training_paths: manager-defined grouping (metadata; items reference catalog below)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.training_paths (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_paths_pkey PRIMARY KEY (id),
    CONSTRAINT training_paths_created_by_users_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_training_paths_is_active ON public.training_paths USING btree (is_active);

CREATE TRIGGER update_training_paths_row_updated_at
    BEFORE UPDATE ON public.training_paths
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. training_path_items: exactly one of course_id, module_id, lesson_id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.training_path_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    training_path_id uuid NOT NULL,
    course_id uuid,
    module_id uuid,
    lesson_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_path_items_pkey PRIMARY KEY (id),
    CONSTRAINT training_path_items_training_path_id_fkey FOREIGN KEY (training_path_id) REFERENCES public.training_paths(id) ON DELETE CASCADE,
    CONSTRAINT training_path_items_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
    CONSTRAINT training_path_items_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE,
    CONSTRAINT training_path_items_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE,
    CONSTRAINT training_path_items_one_scope_check CHECK (
        (CASE WHEN course_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN module_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END)
      = 1
    ),
    CONSTRAINT training_path_items_path_sort_unique UNIQUE (training_path_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_training_path_items_path ON public.training_path_items USING btree (training_path_id);

CREATE TRIGGER update_training_path_items_updated_at
    BEFORE UPDATE ON public.training_path_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Assignments: which users have which training_paths (My Trainings list)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.training_path_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    training_path_id uuid NOT NULL,
    status text DEFAULT 'assigned'::text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_path_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT training_path_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT training_path_assignments_training_path_id_fkey FOREIGN KEY (training_path_id) REFERENCES public.training_paths(id) ON DELETE CASCADE,
    CONSTRAINT training_path_assignments_status_check CHECK (
        status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'completed'::text, 'paused'::text])
    ),
    CONSTRAINT training_path_assignments_user_path_unique UNIQUE (user_id, training_path_id)
);

CREATE INDEX IF NOT EXISTS idx_training_path_assignments_user_id ON public.training_path_assignments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_training_path_assignments_training_path_id ON public.training_path_assignments USING btree (training_path_id);

CREATE TRIGGER update_training_path_assignments_updated_at
    BEFORE UPDATE ON public.training_path_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. users.current_training_path_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS current_training_path_id uuid;

COMMENT ON COLUMN public.users.current_training_path_id IS 'Active training_path for the user; must be assigned via training_path_assignments.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_current_training_path_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_current_training_path_id_fkey
      FOREIGN KEY (current_training_path_id) REFERENCES public.training_paths(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_current_training_path_id ON public.users USING btree (current_training_path_id);

CREATE OR REPLACE FUNCTION public.users_validate_current_training_path() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.current_training_path_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.training_path_assignments a
            WHERE a.training_path_id = NEW.current_training_path_id
              AND a.user_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'current_training_path_id must reference a training_path assigned to this user'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_validate_current_training_path ON public.users;

CREATE TRIGGER trg_users_validate_current_training_path
    BEFORE INSERT OR UPDATE OF current_training_path_id ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.users_validate_current_training_path();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.training_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_path_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_path_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view training_paths"
    ON public.training_paths FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Mentors and above can manage training_paths"
    ON public.training_paths FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

CREATE POLICY "Authenticated users can view training_path_items"
    ON public.training_path_items FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Mentors and above can manage training_path_items"
    ON public.training_path_items FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

CREATE POLICY "Users can view own training_path_assignments"
    ON public.training_path_assignments FOR SELECT
    USING ((auth.uid() = user_id));

CREATE POLICY "Managers and gods can view all training_path_assignments"
    ON public.training_path_assignments FOR SELECT
    USING ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
      )
    ));

CREATE POLICY "Users insert own training_path_assignments"
    ON public.training_path_assignments FOR INSERT
    TO authenticated
    WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Managers and gods insert training_path_assignments"
    ON public.training_path_assignments FOR INSERT
    TO authenticated
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
      )
    ));

CREATE POLICY "Users update own training_path_assignments"
    ON public.training_path_assignments FOR UPDATE
    USING ((auth.uid() = user_id))
    WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Managers and gods update all training_path_assignments"
    ON public.training_path_assignments FOR UPDATE
    USING ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
      )
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_paths TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_path_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_path_assignments TO authenticated;
GRANT ALL ON public.training_paths TO service_role;
GRANT ALL ON public.training_path_items TO service_role;
GRANT ALL ON public.training_path_assignments TO service_role;

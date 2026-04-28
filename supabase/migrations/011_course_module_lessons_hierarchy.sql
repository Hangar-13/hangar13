-- Course → module → lesson hierarchy. Rename curriculums → courses, add modules & curricula tagging.
-- Lessons reference modules; user_trainings.curriculum_id → course_id.

-- ---------------------------------------------------------------------------
-- 1. Rename catalog table curriculums → courses
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'curriculums'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'courses'
  ) THEN
    ALTER TABLE public.curriculums RENAME TO courses;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curriculums_pkey') THEN
    ALTER TABLE public.courses RENAME CONSTRAINT curriculums_pkey TO courses_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curriculums_created_by_fkey') THEN
    ALTER TABLE public.courses RENAME CONSTRAINT curriculums_created_by_fkey TO courses_created_by_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_curriculums_updated_at' AND tgrelid = 'public.courses'::regclass
  ) THEN
    ALTER TRIGGER update_curriculums_updated_at ON public.courses RENAME TO update_courses_updated_at;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. modules (content modules; one course has many modules)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modules_pkey PRIMARY KEY (id),
    CONSTRAINT modules_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_modules_course_id ON public.modules USING btree (course_id);

CREATE TRIGGER update_modules_updated_at
    BEFORE UPDATE ON public.modules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view modules"
    ON public.modules FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Mentors and above can manage modules"
    ON public.modules
    FOR ALL
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

GRANT SELECT ON public.modules TO authenticated;
GRANT ALL ON public.modules TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Default module per existing course (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.modules (course_id, title, sort_order)
SELECT c.id, 'Core content'::text, 0
FROM public.courses c
WHERE NOT EXISTS (SELECT 1 FROM public.modules m WHERE m.course_id = c.id);

-- ---------------------------------------------------------------------------
-- 4. Repoint lessons: curriculum_id → module_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'curriculum_id'
  ) THEN
    ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS module_id uuid;

    UPDATE public.lessons l
    SET module_id = m.id
    FROM public.modules m
    WHERE m.course_id = l.curriculum_id
      AND l.module_id IS NULL;

    ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_curriculum_id_fkey;
    ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_curriculum_id_week_number_key;

    ALTER TABLE public.lessons DROP COLUMN curriculum_id;

    ALTER TABLE public.lessons ALTER COLUMN module_id SET NOT NULL;

    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_module_id_fkey
      FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;

    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_module_id_week_number_key UNIQUE (module_id, week_number);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_lessons_curriculum_id') THEN
    DROP INDEX public.idx_lessons_curriculum_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lessons_module_id ON public.lessons USING btree (module_id);

-- ---------------------------------------------------------------------------
-- 5. user_trainings: curriculum_id → course_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_trainings' AND column_name = 'curriculum_id'
  ) THEN
    ALTER TABLE public.user_trainings DROP CONSTRAINT IF EXISTS user_trainings_curriculum_id_fkey;

    ALTER TABLE public.user_trainings RENAME COLUMN curriculum_id TO course_id;

    ALTER TABLE public.user_trainings
      ADD CONSTRAINT user_trainings_course_id_fkey
      FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_user_trainings_curriculum_id') THEN
    ALTER INDEX public.idx_user_trainings_curriculum_id RENAME TO idx_user_trainings_course_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Curricula (tags) and course_curricula (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curricula (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT curricula_pkey PRIMARY KEY (id),
    CONSTRAINT curricula_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_curricula_slug ON public.curricula USING btree (slug);

CREATE TRIGGER update_curricula_updated_at
    BEFORE UPDATE ON public.curricula
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.curricula ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view curricula"
    ON public.curricula FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Mentors and above can manage curricula"
    ON public.curricula
    FOR ALL
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

GRANT SELECT ON public.curricula TO authenticated;
GRANT ALL ON public.curricula TO service_role;

CREATE TABLE IF NOT EXISTS public.course_curricula (
    course_id uuid NOT NULL,
    curriculum_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT course_curricula_pkey PRIMARY KEY (course_id, curriculum_id),
    CONSTRAINT course_curricula_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
    CONSTRAINT course_curricula_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES public.curricula(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_curricula_curriculum_id ON public.course_curricula USING btree (curriculum_id);

ALTER TABLE public.course_curricula ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view course_curricula"
    ON public.course_curricula FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Mentors and above can manage course_curricula"
    ON public.course_curricula
    FOR ALL
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

GRANT SELECT ON public.course_curricula TO authenticated;
GRANT ALL ON public.course_curricula TO service_role;

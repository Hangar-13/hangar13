-- Supabase Studio shows table columns in PostgreSQL physical column order.
-- Rebuild modules and lessons so "number" and FK columns appear where we want:
-- modules: id, number, title, course_id, ...
-- lessons: id, number, title, module_id, ...

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. modules: new physical order
-- ---------------------------------------------------------------------------
ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_module_id_fkey;

ALTER TABLE public.training_path_items
  DROP CONSTRAINT IF EXISTS training_path_items_module_id_fkey;

-- Staging constraint names must differ from public.modules (names are unique per schema).
CREATE TABLE public.modules_column_order (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  number integer DEFAULT 0 NOT NULL,
  title text NOT NULL,
  course_id uuid NOT NULL,
  description text,
  is_hidden_from_users boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT modules_column_order_pkey PRIMARY KEY (id),
  CONSTRAINT modules_column_order_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE
);

INSERT INTO public.modules_column_order (
  id,
  number,
  title,
  course_id,
  description,
  is_hidden_from_users,
  created_at,
  updated_at
)
SELECT
  id,
  number,
  title,
  course_id,
  description,
  is_hidden_from_users,
  created_at,
  updated_at
FROM public.modules;

DROP TABLE public.modules;

ALTER TABLE public.modules_column_order RENAME TO modules;

ALTER TABLE public.modules RENAME CONSTRAINT modules_column_order_pkey TO modules_pkey;
ALTER TABLE public.modules RENAME CONSTRAINT modules_column_order_course_id_fkey TO modules_course_id_fkey;

CREATE INDEX idx_modules_course_id ON public.modules USING btree (course_id);

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

COMMENT ON COLUMN public.modules.is_hidden_from_users IS
  'When true, learners see lessons under the course without this module as a visible grouping.';

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_module_id_fkey
  FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;

ALTER TABLE public.training_path_items
  ADD CONSTRAINT training_path_items_module_id_fkey
  FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. lessons: new physical order
-- ---------------------------------------------------------------------------
ALTER TABLE public.training_path_items
  DROP CONSTRAINT IF EXISTS training_path_items_lesson_id_fkey;

ALTER TABLE public.lesson_submissions
  DROP CONSTRAINT IF EXISTS weekly_submissions_lesson_id_fkey;

ALTER TABLE public.lesson_submissions
  DROP CONSTRAINT IF EXISTS lesson_submissions_lesson_id_fkey;

CREATE TABLE public.lessons_column_order (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  number integer NOT NULL,
  title text NOT NULL,
  module_id uuid NOT NULL,
  ata_chapter text,
  learning_objectives text[] DEFAULT '{}'::text[] NOT NULL,
  study_materials text,
  practical_application text,
  mentor_discussion_questions text[] DEFAULT '{}'::text[] NOT NULL,
  weekly_deliverable text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT lessons_column_order_pkey PRIMARY KEY (id),
  CONSTRAINT lessons_column_order_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE,
  CONSTRAINT lessons_column_order_module_id_number_key UNIQUE (module_id, number)
);

INSERT INTO public.lessons_column_order (
  id,
  number,
  title,
  module_id,
  ata_chapter,
  learning_objectives,
  study_materials,
  practical_application,
  mentor_discussion_questions,
  weekly_deliverable,
  created_at,
  updated_at
)
SELECT
  id,
  number,
  title,
  module_id,
  ata_chapter,
  COALESCE(learning_objectives, '{}'::text[]),
  study_materials,
  practical_application,
  COALESCE(mentor_discussion_questions, '{}'::text[]),
  weekly_deliverable,
  created_at,
  updated_at
FROM public.lessons;

DROP TABLE public.lessons;

ALTER TABLE public.lessons_column_order RENAME TO lessons;

ALTER TABLE public.lessons RENAME CONSTRAINT lessons_column_order_pkey TO lessons_pkey;
ALTER TABLE public.lessons RENAME CONSTRAINT lessons_column_order_module_id_fkey TO lessons_module_id_fkey;
ALTER TABLE public.lessons RENAME CONSTRAINT lessons_column_order_module_id_number_key TO lessons_module_id_number_key;

CREATE INDEX idx_lessons_module_id ON public.lessons USING btree (module_id);

CREATE TRIGGER update_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view training plan weeks"
  ON public.lessons FOR SELECT
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Mentors and above can manage training plan weeks"
  ON public.lessons
  FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
    )
  ));

ALTER TABLE public.training_path_items
  ADD CONSTRAINT training_path_items_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE public.lesson_submissions
  ADD CONSTRAINT weekly_submissions_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

COMMIT;

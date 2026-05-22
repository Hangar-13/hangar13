-- Course versioning: immutable snapshots (major.minor), org/user pins, completion audit.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Version records
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    major_version integer NOT NULL,
    minor_version integer NOT NULL,
    release_notes text,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    published_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_versions_pkey PRIMARY KEY (id),
    CONSTRAINT course_versions_course_id_fkey
        FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
    CONSTRAINT course_versions_published_by_fkey
        FOREIGN KEY (published_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT course_versions_major_non_negative CHECK (major_version >= 0),
    CONSTRAINT course_versions_minor_non_negative CHECK (minor_version >= 0),
    CONSTRAINT course_versions_unique_number
        UNIQUE (course_id, major_version, minor_version)
);

CREATE INDEX idx_course_versions_course_id ON public.course_versions USING btree (course_id);
CREATE INDEX idx_course_versions_course_order
    ON public.course_versions USING btree (course_id, major_version DESC, minor_version DESC);

COMMENT ON TABLE public.course_versions IS
    'Immutable published snapshots of a course at major.minor version numbers.';

-- ---------------------------------------------------------------------------
-- 2. Snapshot modules
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_version_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_version_id uuid NOT NULL,
    source_module_id uuid NOT NULL,
    number integer NOT NULL,
    title text NOT NULL,
    description text,
    is_hidden_from_users boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_version_modules_pkey PRIMARY KEY (id),
    CONSTRAINT course_version_modules_version_fkey
        FOREIGN KEY (course_version_id) REFERENCES public.course_versions(id) ON DELETE CASCADE,
    CONSTRAINT course_version_modules_source_module_fkey
        FOREIGN KEY (source_module_id) REFERENCES public.modules(id) ON DELETE RESTRICT,
    CONSTRAINT course_version_modules_unique_number
        UNIQUE (course_version_id, number),
    CONSTRAINT course_version_modules_unique_source
        UNIQUE (course_version_id, source_module_id)
);

CREATE INDEX idx_course_version_modules_version
    ON public.course_version_modules USING btree (course_version_id);

-- ---------------------------------------------------------------------------
-- 3. Snapshot lessons
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_version_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_version_module_id uuid NOT NULL,
    source_lesson_id uuid NOT NULL,
    number integer NOT NULL,
    title text NOT NULL,
    ata_chapter text,
    learning_objectives text[],
    study_materials text,
    practical_application text,
    mentor_discussion_questions text[],
    weekly_deliverable text,
    hours numeric(10,2) DEFAULT 0 NOT NULL,
    acs_codes integer[],
    ata_chapter_ids integer[],
    talent_lms_unit_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_version_lessons_pkey PRIMARY KEY (id),
    CONSTRAINT course_version_lessons_module_fkey
        FOREIGN KEY (course_version_module_id) REFERENCES public.course_version_modules(id) ON DELETE CASCADE,
    CONSTRAINT course_version_lessons_source_lesson_fkey
        FOREIGN KEY (source_lesson_id) REFERENCES public.lessons(id) ON DELETE RESTRICT,
    CONSTRAINT course_version_lessons_unique_number
        UNIQUE (course_version_module_id, number),
    CONSTRAINT course_version_lessons_unique_source
        UNIQUE (course_version_module_id, source_lesson_id),
    CONSTRAINT course_version_lessons_hours_non_negative CHECK (hours >= 0)
);

CREATE INDEX idx_course_version_lessons_module
    ON public.course_version_lessons USING btree (course_version_module_id);
CREATE INDEX idx_course_version_lessons_source
    ON public.course_version_lessons USING btree (source_lesson_id);

-- ---------------------------------------------------------------------------
-- 4. Org / user version pins (exactly one scope per row)
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_version_pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    course_version_id uuid NOT NULL,
    organization_id uuid,
    user_id uuid,
    pinned_at timestamp with time zone DEFAULT now() NOT NULL,
    pinned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_version_pins_pkey PRIMARY KEY (id),
    CONSTRAINT course_version_pins_course_id_fkey
        FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
    CONSTRAINT course_version_pins_version_fkey
        FOREIGN KEY (course_version_id) REFERENCES public.course_versions(id) ON DELETE RESTRICT,
    CONSTRAINT course_version_pins_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    CONSTRAINT course_version_pins_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT course_version_pins_pinned_by_fkey
        FOREIGN KEY (pinned_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT course_version_pins_scope_check CHECK (
        (organization_id IS NOT NULL AND user_id IS NULL)
        OR (organization_id IS NULL AND user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX course_version_pins_org_unique
    ON public.course_version_pins (course_id, organization_id)
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX course_version_pins_user_unique
    ON public.course_version_pins (course_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX idx_course_version_pins_version
    ON public.course_version_pins USING btree (course_version_id);

CREATE TRIGGER update_course_version_pins_updated_at
    BEFORE UPDATE ON public.course_version_pins
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.course_version_pins IS
    'Which course version an organization or individual user has adopted. One pin per course per org or user.';

-- ---------------------------------------------------------------------------
-- 5. Record version at lesson submission time
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_submissions
    ADD COLUMN IF NOT EXISTS course_version_id uuid;

ALTER TABLE public.lesson_submissions
    DROP CONSTRAINT IF EXISTS lesson_submissions_course_version_id_fkey;

ALTER TABLE public.lesson_submissions
    ADD CONSTRAINT lesson_submissions_course_version_id_fkey
        FOREIGN KEY (course_version_id) REFERENCES public.course_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lesson_submissions.course_version_id IS
    'Course version active for the learner when this lesson was submitted.';

-- ---------------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.course_version_sort_key(p_major integer, p_minor integer)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (p_major::bigint << 32) + p_minor::bigint;
$$;

CREATE OR REPLACE FUNCTION public.auth_course_version_reachable(p_course_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.course_versions cv
        WHERE cv.id = p_course_version_id
          AND (
            public.auth_org_mentor_plus_for_course(cv.course_id)
            OR public.auth_course_reachable_via_enrollment(cv.course_id)
          )
    );
$$;

REVOKE ALL ON FUNCTION public.course_version_sort_key(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_version_sort_key(integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auth_course_version_reachable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_course_version_reachable(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Backfill v1.0 for existing courses
-- ---------------------------------------------------------------------------
INSERT INTO public.course_versions (course_id, major_version, minor_version, release_notes, published_at)
SELECT
    c.id,
    1,
    0,
    'Initial version (migrated)',
    COALESCE(c.created_at, now())
FROM public.courses c
WHERE NOT EXISTS (
    SELECT 1 FROM public.course_versions cv
    WHERE cv.course_id = c.id
);

INSERT INTO public.course_version_modules (
    course_version_id,
    source_module_id,
    number,
    title,
    description,
    is_hidden_from_users
)
SELECT
    cv.id,
    m.id,
    m.number,
    m.title,
    m.description,
    COALESCE(m.is_hidden_from_users, false)
FROM public.course_versions cv
JOIN public.modules m ON m.course_id = cv.course_id
WHERE cv.major_version = 1 AND cv.minor_version = 0
  AND NOT EXISTS (
      SELECT 1 FROM public.course_version_modules cvm
      WHERE cvm.course_version_id = cv.id AND cvm.source_module_id = m.id
  );

INSERT INTO public.course_version_lessons (
    course_version_module_id,
    source_lesson_id,
    number,
    title,
    ata_chapter,
    learning_objectives,
    study_materials,
    practical_application,
    mentor_discussion_questions,
    weekly_deliverable,
    hours,
    acs_codes,
    ata_chapter_ids,
    talent_lms_unit_id
)
SELECT
    cvm.id,
    l.id,
    l.number,
    l.title,
    l.ata_chapter,
    l.learning_objectives,
    l.study_materials,
    l.practical_application,
    l.mentor_discussion_questions,
    l.weekly_deliverable,
    COALESCE(l.hours, 0),
    l.acs_codes,
    l.ata_chapter_ids,
    l.talent_lms_unit_id
FROM public.course_version_modules cvm
JOIN public.course_versions cv ON cv.id = cvm.course_version_id
JOIN public.modules m ON m.id = cvm.source_module_id
JOIN public.lessons l ON l.module_id = m.id
WHERE cv.major_version = 1 AND cv.minor_version = 0
  AND NOT EXISTS (
      SELECT 1 FROM public.course_version_lessons cvl
      WHERE cvl.course_version_module_id = cvm.id
        AND cvl.source_lesson_id = l.id
  );

-- User pins for existing enrollments
INSERT INTO public.course_version_pins (course_id, course_version_id, user_id, pinned_at)
SELECT DISTINCT
    pc.course_id,
    cv.id,
    pc.user_id,
    now()
FROM (
    SELECT ut.user_id, tpi.course_id AS course_id
    FROM public.user_trainings ut
    JOIN public.training_path_items tpi ON tpi.training_path_id = ut.training_path_id
    WHERE tpi.course_id IS NOT NULL
    UNION
    SELECT ut.user_id, m.course_id
    FROM public.user_trainings ut
    JOIN public.training_path_items tpi ON tpi.training_path_id = ut.training_path_id
    JOIN public.modules m ON m.id = tpi.module_id
    UNION
    SELECT ut.user_id, m.course_id
    FROM public.user_trainings ut
    JOIN public.training_path_items tpi ON tpi.training_path_id = ut.training_path_id
    JOIN public.lessons l ON l.id = tpi.lesson_id
    JOIN public.modules m ON m.id = l.module_id
) pc
JOIN public.course_versions cv
    ON cv.course_id = pc.course_id
   AND cv.major_version = 1
   AND cv.minor_version = 0
WHERE NOT EXISTS (
    SELECT 1 FROM public.course_version_pins p
    WHERE p.course_id = pc.course_id AND p.user_id = pc.user_id
);

-- Org pins for existing entitlements
INSERT INTO public.course_version_pins (course_id, course_version_id, organization_id, pinned_at)
SELECT DISTINCT
    pc.course_id,
    cv.id,
    ote.organization_id,
    now()
FROM public.organization_training_entitlements ote
JOIN (
    SELECT tpi.training_path_id, tpi.course_id AS course_id
    FROM public.training_path_items tpi
    WHERE tpi.course_id IS NOT NULL
    UNION
    SELECT tpi.training_path_id, m.course_id
    FROM public.training_path_items tpi
    JOIN public.modules m ON m.id = tpi.module_id
    UNION
    SELECT tpi.training_path_id, m.course_id
    FROM public.training_path_items tpi
    JOIN public.lessons l ON l.id = tpi.lesson_id
    JOIN public.modules m ON m.id = l.module_id
) pc ON pc.training_path_id = ote.training_path_id
JOIN public.course_versions cv
    ON cv.course_id = pc.course_id
   AND cv.major_version = 1
   AND cv.minor_version = 0
WHERE NOT EXISTS (
    SELECT 1 FROM public.course_version_pins p
    WHERE p.course_id = pc.course_id AND p.organization_id = ote.organization_id
);

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_version_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_version_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_version_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_versions_select ON public.course_versions
    FOR SELECT
    USING (
        public.auth_is_platform_admin()
        OR public.auth_org_mentor_plus_for_course(course_id)
        OR public.auth_course_reachable_via_enrollment(course_id)
    );

CREATE POLICY course_versions_insert ON public.course_versions
    FOR INSERT
    WITH CHECK (
        public.auth_is_platform_admin()
        OR public.auth_org_has_manager_plus((
            SELECT c.organization_id FROM public.courses c WHERE c.id = course_id
        ))
    );

CREATE POLICY course_version_modules_select ON public.course_version_modules
    FOR SELECT
    USING (public.auth_course_version_reachable(course_version_id));

CREATE POLICY course_version_modules_insert ON public.course_version_modules
    FOR INSERT
    WITH CHECK (
        public.auth_is_platform_admin()
        OR public.auth_org_has_manager_plus((
            SELECT c.organization_id
            FROM public.course_versions cv
            JOIN public.courses c ON c.id = cv.course_id
            WHERE cv.id = course_version_id
        ))
    );

CREATE POLICY course_version_lessons_select ON public.course_version_lessons
    FOR SELECT
    USING (
        public.auth_course_version_reachable((
            SELECT cvm.course_version_id
            FROM public.course_version_modules cvm
            WHERE cvm.id = course_version_module_id
        ))
    );

CREATE POLICY course_version_lessons_insert ON public.course_version_lessons
    FOR INSERT
    WITH CHECK (
        public.auth_is_platform_admin()
        OR public.auth_org_has_manager_plus((
            SELECT c.organization_id
            FROM public.course_version_modules cvm
            JOIN public.course_versions cv ON cv.id = cvm.course_version_id
            JOIN public.courses c ON c.id = cv.course_id
            WHERE cvm.id = course_version_module_id
        ))
    );

CREATE POLICY course_version_pins_select ON public.course_version_pins
    FOR SELECT
    USING (
        public.auth_is_platform_admin()
        OR (user_id IS NOT NULL AND user_id = auth.uid())
        OR (
            organization_id IS NOT NULL
            AND public.auth_org_has_any_member(organization_id)
        )
    );

CREATE POLICY course_version_pins_insert ON public.course_version_pins
    FOR INSERT
    WITH CHECK (
        public.auth_is_platform_admin()
        OR (user_id IS NOT NULL AND user_id = auth.uid())
        OR (
            organization_id IS NOT NULL
            AND public.auth_is_org_supervisor(organization_id)
        )
    );

CREATE POLICY course_version_pins_update ON public.course_version_pins
    FOR UPDATE
    USING (
        public.auth_is_platform_admin()
        OR (user_id IS NOT NULL AND user_id = auth.uid())
        OR (
            organization_id IS NOT NULL
            AND public.auth_is_org_supervisor(organization_id)
        )
    )
    WITH CHECK (
        public.auth_is_platform_admin()
        OR (user_id IS NOT NULL AND user_id = auth.uid())
        OR (
            organization_id IS NOT NULL
            AND public.auth_is_org_supervisor(organization_id)
        )
    );

COMMIT;

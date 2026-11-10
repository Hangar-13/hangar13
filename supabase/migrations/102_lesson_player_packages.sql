-- In-app lesson player packages (SCORM) replace TalentLMS unit ids, course ids,
-- account provisioning, and submission snapshots.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Packages and attempts
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    schema_version text NOT NULL,
    mastery_score numeric,
    launch_path text NOT NULL,
    original_filename text,
    sco_count integer DEFAULT 1 NOT NULL,
    object_paths text[] DEFAULT '{}'::text[] NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lesson_packages_pkey PRIMARY KEY (id),
    CONSTRAINT lesson_packages_lesson_id_fkey
        FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE,
    CONSTRAINT lesson_packages_uploaded_by_fkey
        FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT lesson_packages_kind_check CHECK (kind IN ('content', 'test')),
    CONSTRAINT lesson_packages_sco_count_positive CHECK (sco_count >= 1)
);

CREATE INDEX idx_lesson_packages_lesson_id ON public.lesson_packages USING btree (lesson_id);

COMMENT ON TABLE public.lesson_packages IS
    'Immutable uploaded lesson package (currently a SCORM zip). Live lessons and course versions point at rows; replacing a package inserts a new row.';

ALTER TABLE public.lessons
    ADD COLUMN IF NOT EXISTS content_package_id uuid,
    ADD COLUMN IF NOT EXISTS test_package_id uuid;

ALTER TABLE public.lessons
    DROP CONSTRAINT IF EXISTS lessons_content_package_id_fkey;
ALTER TABLE public.lessons
    ADD CONSTRAINT lessons_content_package_id_fkey
        FOREIGN KEY (content_package_id) REFERENCES public.lesson_packages(id) ON DELETE SET NULL;

ALTER TABLE public.lessons
    DROP CONSTRAINT IF EXISTS lessons_test_package_id_fkey;
ALTER TABLE public.lessons
    ADD CONSTRAINT lessons_test_package_id_fkey
        FOREIGN KEY (test_package_id) REFERENCES public.lesson_packages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lessons.content_package_id IS
    'Current lesson package shown as the lesson (not the test).';
COMMENT ON COLUMN public.lessons.test_package_id IS
    'Current lesson package shown as the lesson test.';

ALTER TABLE public.course_version_lessons
    ADD COLUMN IF NOT EXISTS content_package_id uuid,
    ADD COLUMN IF NOT EXISTS test_package_id uuid;

ALTER TABLE public.course_version_lessons
    DROP CONSTRAINT IF EXISTS course_version_lessons_content_package_id_fkey;
ALTER TABLE public.course_version_lessons
    ADD CONSTRAINT course_version_lessons_content_package_id_fkey
        FOREIGN KEY (content_package_id) REFERENCES public.lesson_packages(id) ON DELETE SET NULL;

ALTER TABLE public.course_version_lessons
    DROP CONSTRAINT IF EXISTS course_version_lessons_test_package_id_fkey;
ALTER TABLE public.course_version_lessons
    ADD CONSTRAINT course_version_lessons_test_package_id_fkey
        FOREIGN KEY (test_package_id) REFERENCES public.lesson_packages(id) ON DELETE SET NULL;

CREATE TABLE public.lesson_player_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    user_id uuid NOT NULL,
    lesson_status text NOT NULL DEFAULT 'not attempted',
    score_raw numeric,
    score_min numeric,
    score_max numeric,
    lesson_location text,
    suspend_data text,
    session_time text,
    exit_mode text,
    cmi jsonb DEFAULT '{}'::jsonb NOT NULL,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lesson_player_attempts_pkey PRIMARY KEY (id),
    CONSTRAINT lesson_player_attempts_package_id_fkey
        FOREIGN KEY (package_id) REFERENCES public.lesson_packages(id) ON DELETE CASCADE,
    CONSTRAINT lesson_player_attempts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT lesson_player_attempts_package_user_key UNIQUE (package_id, user_id)
);

CREATE INDEX idx_lesson_player_attempts_user_id
    ON public.lesson_player_attempts USING btree (user_id);

CREATE TRIGGER update_lesson_player_attempts_updated_at
    BEFORE UPDATE ON public.lesson_player_attempts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.lesson_player_attempts IS
    'One saved sitting per learner per lesson package. cmi is the runtime blob; lesson_status and score_raw are the fields the rest of the app reads.';

ALTER TABLE public.lesson_submissions
    ADD COLUMN IF NOT EXISTS player_completion jsonb;

COMMENT ON COLUMN public.lesson_submissions.player_completion IS
    'Lesson-player snapshot at reflection submit time: { checkedAt, content, test }.';

-- ---------------------------------------------------------------------------
-- 2. Access helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_can_manage_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.auth_is_platform_admin()
        OR EXISTS (
            SELECT 1
            FROM public.lessons l
            INNER JOIN public.modules m ON m.id = l.module_id
            WHERE l.id = p_lesson_id
              AND public.auth_org_mentor_plus_for_course(m.course_id)
        );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_play_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.auth_can_manage_lesson(p_lesson_id)
        OR public.auth_lesson_reachable_via_enrollment(p_lesson_id);
$$;

REVOKE ALL ON FUNCTION public.auth_can_manage_lesson(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_lesson(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auth_can_play_lesson(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_play_lesson(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_player_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Play or manage lesson packages"
    ON public.lesson_packages FOR SELECT
    TO authenticated
    USING (public.auth_can_play_lesson(lesson_id));

CREATE POLICY "Managers insert lesson packages"
    ON public.lesson_packages FOR INSERT
    TO authenticated
    WITH CHECK (public.auth_can_manage_lesson(lesson_id));

CREATE POLICY "Managers delete lesson packages"
    ON public.lesson_packages FOR DELETE
    TO authenticated
    USING (public.auth_can_manage_lesson(lesson_id));

CREATE POLICY "Learners read own lesson attempts"
    ON public.lesson_player_attempts FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.lesson_packages p
            WHERE p.id = package_id
              AND public.auth_can_manage_lesson(p.lesson_id)
        )
    );

CREATE POLICY "Learners insert own lesson attempts"
    ON public.lesson_player_attempts FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.lesson_packages p
            WHERE p.id = package_id
              AND public.auth_can_play_lesson(p.lesson_id)
        )
    );

CREATE POLICY "Learners update own lesson attempts"
    ON public.lesson_player_attempts FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.lesson_packages p
            WHERE p.id = package_id
              AND public.auth_can_play_lesson(p.lesson_id)
        )
    );

GRANT SELECT, INSERT, DELETE ON public.lesson_packages TO authenticated;
GRANT ALL ON public.lesson_packages TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.lesson_player_attempts TO authenticated;
GRANT ALL ON public.lesson_player_attempts TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Private storage for unzipped package files
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lesson-packages', 'lesson-packages', false, 41943040)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 41943040;

-- ---------------------------------------------------------------------------
-- 5. Drop TalentLMS columns and helpers
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_submissions
    DROP COLUMN IF EXISTS talent_lms_unit_completed,
    DROP COLUMN IF EXISTS talent_lms_completion_checked_at,
    DROP COLUMN IF EXISTS talent_lms_completion_meta;

ALTER TABLE public.lessons
    DROP COLUMN IF EXISTS talent_lms_unit_id,
    DROP COLUMN IF EXISTS talent_lms_test_unit_id;

ALTER TABLE public.course_version_lessons
    DROP COLUMN IF EXISTS talent_lms_unit_id,
    DROP COLUMN IF EXISTS talent_lms_test_unit_id;

ALTER TABLE public.courses
    DROP COLUMN IF EXISTS talent_lms_course_id;

DROP FUNCTION IF EXISTS public.record_talent_lms_provision_result(boolean, text);

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_talent_lms_provision_status_check;

ALTER TABLE public.users
    DROP COLUMN IF EXISTS talent_lms_provision_status,
    DROP COLUMN IF EXISTS talent_lms_provision_attempts,
    DROP COLUMN IF EXISTS talent_lms_provisioned_at,
    DROP COLUMN IF EXISTS talent_lms_provision_last_error;

DROP FUNCTION IF EXISTS public.get_session_user_profile();

CREATE FUNCTION public.get_session_user_profile()
RETURNS TABLE (
    id uuid,
    full_name text,
    email text,
    role text,
    visible boolean,
    last_active_organization_id uuid,
    current_user_training_id uuid,
    current_certification text,
    default_start_path text,
    prior_ojt_skipped_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
    SELECT
        u.id,
        u.full_name,
        u.email,
        u.role,
        u.visible,
        u.last_active_organization_id,
        u.current_user_training_id,
        u.current_certification::text AS current_certification,
        u.default_start_path,
        u.prior_ojt_skipped_at
    FROM public.users u
    WHERE u.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_session_user_profile() IS
    'Returns at most one row: the caller''s public.users record (auth.uid()), regardless of users RLS.';

REVOKE ALL ON FUNCTION public.get_session_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO service_role;

COMMIT;

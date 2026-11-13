-- A student can adopt a new course version while keeping some lessons on the
-- version they already finished. Those lessons stay pinned here until the
-- student updates them one at a time.

BEGIN;

CREATE TABLE public.lesson_version_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    course_version_id uuid NOT NULL,
    kept_by_user boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lesson_version_holds_pkey PRIMARY KEY (id),
    CONSTRAINT lesson_version_holds_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT lesson_version_holds_lesson_id_fkey
        FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE,
    CONSTRAINT lesson_version_holds_course_version_id_fkey
        FOREIGN KEY (course_version_id) REFERENCES public.course_versions(id) ON DELETE CASCADE,
    CONSTRAINT lesson_version_holds_user_lesson_unique UNIQUE (user_id, lesson_id)
);

COMMENT ON TABLE public.lesson_version_holds IS
    'Lessons a student is still taking from an older course version after adopting a newer one.';

COMMENT ON COLUMN public.lesson_version_holds.kept_by_user IS
    'True when the student chose to keep a completed lesson. False when an unfinished optional lesson was left in place.';

CREATE INDEX idx_lesson_version_holds_user
    ON public.lesson_version_holds USING btree (user_id);

ALTER TABLE public.lesson_version_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_version_holds_select ON public.lesson_version_holds
    FOR SELECT
    USING (
        public.auth_is_platform_admin()
        OR user_id = auth.uid()
        OR public.trainee_effective_mentor_id(user_id) = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.user_trainings ut
            JOIN public.training_paths tp ON tp.id = ut.training_path_id
            WHERE ut.user_id = lesson_version_holds.user_id
              AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
    );

CREATE POLICY lesson_version_holds_insert ON public.lesson_version_holds
    FOR INSERT
    WITH CHECK (
        public.auth_is_platform_admin()
        OR user_id = auth.uid()
    );

CREATE POLICY lesson_version_holds_update ON public.lesson_version_holds
    FOR UPDATE
    USING (
        public.auth_is_platform_admin()
        OR user_id = auth.uid()
    )
    WITH CHECK (
        public.auth_is_platform_admin()
        OR user_id = auth.uid()
    );

CREATE POLICY lesson_version_holds_delete ON public.lesson_version_holds
    FOR DELETE
    USING (
        public.auth_is_platform_admin()
        OR user_id = auth.uid()
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_version_holds TO authenticated;
GRANT ALL ON public.lesson_version_holds TO service_role;

COMMIT;

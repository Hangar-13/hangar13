-- Mentors and training managers can read a learner's lesson sittings,
-- including a sitting whose file has since been replaced.

BEGIN;

DROP POLICY IF EXISTS "Learners read own lesson attempts" ON public.lesson_player_attempts;

CREATE POLICY "Learners read own lesson attempts"
    ON public.lesson_player_attempts FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_is_platform_admin()
        OR public.trainee_effective_mentor_id(user_id) = auth.uid()
        OR (
            lesson_id IS NOT NULL
            AND public.auth_can_manage_lesson(lesson_id)
        )
        OR EXISTS (
            SELECT 1
            FROM public.lesson_packages AS p
            WHERE p.id = package_id
              AND public.auth_can_manage_lesson(p.lesson_id)
        )
        OR EXISTS (
            SELECT 1
            FROM public.user_trainings AS ut
            INNER JOIN public.training_paths AS tp ON tp.id = ut.training_path_id
            WHERE ut.user_id = lesson_player_attempts.user_id
              AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
    );

COMMIT;

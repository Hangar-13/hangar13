-- Mentors assigned via users.mentor_id must see that trainee’s profile and enrollments even when
-- user_trainings.mentor_id is not set yet (or drifted). Policy 045 only allowed profile reads when
-- an enrollment row had mentor_id = auth.uid(), which broke mentor/student detail loads and embeds.

BEGIN;

DROP POLICY IF EXISTS "Mentors can view assigned mentee profiles" ON public.users;

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
    OR public.auth_user_trainee_mentor_matches(users.id, auth.uid())
  );

DROP POLICY IF EXISTS "Mentors can view profile-assigned trainee enrollments" ON public.user_trainings;

CREATE POLICY "Mentors can view profile-assigned trainee enrollments"
  ON public.user_trainings
  FOR SELECT
  TO authenticated
  USING (public.auth_user_trainee_mentor_matches(user_id, auth.uid()));

COMMIT;

-- Logbook mentor RLS used EXISTS (SELECT … FROM public.users trainee …). Evaluating users
-- re-entered policies like "Users can view reviewers …", which SELECT logbook_entries again,
-- causing 42P17 infinite recursion (often after assigning users.mentor_id / auto-approved rows).

BEGIN;

DROP POLICY IF EXISTS "Mentors can approve logbook entries" ON public.logbook_entries;
CREATE POLICY "Mentors can approve logbook entries"
  ON public.logbook_entries
  FOR UPDATE
  TO authenticated
  USING (public.auth_user_trainee_mentor_matches(user_id, auth.uid()))
  WITH CHECK (public.auth_user_trainee_mentor_matches(user_id, auth.uid()));

DROP POLICY IF EXISTS "Mentors can view apprentice logbook entries" ON public.logbook_entries;
CREATE POLICY "Mentors can view apprentice logbook entries"
  ON public.logbook_entries
  FOR SELECT
  TO authenticated
  USING (public.auth_user_trainee_mentor_matches(user_id, auth.uid()));

DROP POLICY IF EXISTS "Mentors can read apprentice logbook entry acs" ON public.logbook_entry_acs;
CREATE POLICY "Mentors can read apprentice logbook entry acs"
  ON public.logbook_entry_acs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      WHERE le.id = logbook_entry_acs.logbook_entry_id
        AND public.auth_user_trainee_mentor_matches(le.user_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Mentors can view apprentice logbook entry ACS pending" ON public.logbook_entry_acs_pending;
CREATE POLICY "Mentors can view apprentice logbook entry ACS pending"
  ON public.logbook_entry_acs_pending
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      WHERE le.id = logbook_entry_acs_pending.logbook_entry_id
        AND public.auth_user_trainee_mentor_matches(le.user_id, auth.uid())
    )
  );

COMMIT;

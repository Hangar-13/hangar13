-- One mentor per student (canonical users.mentor_id), synced to all enrollments.
-- Sign-offs and submission notifications use the assigned mentor only (not org managers).
-- Mentor assignment is done via assign_enrollment_mentor() so org mentors can write mentor_id under RLS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Canonical mentor on user profile
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mentor_id uuid
    REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_mentor_id ON public.users USING btree (mentor_id);

COMMENT ON COLUMN public.users.mentor_id IS
  'Primary mentor user for this trainee; copied to all user_trainings rows for notifications and sign-off.';

-- ---------------------------------------------------------------------------
-- 2) Backfill + normalize: one mentor per user from enrollments
-- ---------------------------------------------------------------------------
WITH counts AS (
  SELECT ut.user_id, ut.mentor_id, COUNT(*)::bigint AS c
  FROM public.user_trainings ut
  WHERE ut.mentor_id IS NOT NULL
  GROUP BY ut.user_id, ut.mentor_id
),
picked AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    mentor_id
  FROM counts
  ORDER BY user_id, c DESC, mentor_id
)
UPDATE public.users u
SET mentor_id = picked.mentor_id
FROM picked
WHERE u.id = picked.user_id
  AND (u.mentor_id IS DISTINCT FROM picked.mentor_id);

UPDATE public.user_trainings ut
SET mentor_id = u.mentor_id
FROM public.users u
WHERE ut.user_id = u.id
  AND u.mentor_id IS NOT NULL
  AND ut.mentor_id IS DISTINCT FROM u.mentor_id;

-- ---------------------------------------------------------------------------
-- 3) Effective mentor helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enrollment_effective_mentor_id(p_user_training_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.mentor_id, ut.mentor_id)
  FROM public.user_trainings ut
  JOIN public.users u ON u.id = ut.user_id
  WHERE ut.id = p_user_training_id;
$$;

COMMENT ON FUNCTION public.enrollment_effective_mentor_id(uuid) IS
  'Mentor user id for sign-off and notifications: users.mentor_id wins, else enrollment mentor_id.';

REVOKE ALL ON FUNCTION public.enrollment_effective_mentor_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrollment_effective_mentor_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enrollment_effective_mentor_id(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Sync triggers: profile <-> enrollments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_trainings_default_mentor_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mentor_id IS NULL THEN
    SELECT u.mentor_id INTO NEW.mentor_id
    FROM public.users u
    WHERE u.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_trainings_default_mentor ON public.user_trainings;
CREATE TRIGGER trg_user_trainings_default_mentor
  BEFORE INSERT ON public.user_trainings
  FOR EACH ROW
  EXECUTE FUNCTION public.user_trainings_default_mentor_from_profile();

CREATE OR REPLACE FUNCTION public.user_trainings_propagate_mentor_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_mid := NEW.mentor_id;
  ELSE
    v_mid := NEW.mentor_id;
    IF v_mid IS NOT DISTINCT FROM OLD.mentor_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_mid IS NOT NULL THEN
    UPDATE public.users u
    SET mentor_id = v_mid
    WHERE u.id = NEW.user_id
      AND (u.mentor_id IS DISTINCT FROM v_mid);

    UPDATE public.user_trainings ut
    SET mentor_id = v_mid
    WHERE ut.user_id = NEW.user_id
      AND ut.id IS DISTINCT FROM NEW.id
      AND (ut.mentor_id IS DISTINCT FROM v_mid);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_trainings_propagate_mentor ON public.user_trainings;
CREATE TRIGGER trg_user_trainings_propagate_mentor
  AFTER INSERT OR UPDATE OF mentor_id ON public.user_trainings
  FOR EACH ROW
  EXECUTE FUNCTION public.user_trainings_propagate_mentor_change();

CREATE OR REPLACE FUNCTION public.users_propagate_mentor_to_enrollments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id THEN
    UPDATE public.user_trainings ut
    SET mentor_id = NEW.mentor_id
    WHERE ut.user_id = NEW.id
      AND (ut.mentor_id IS DISTINCT FROM NEW.mentor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_propagate_mentor ON public.users;
CREATE TRIGGER trg_users_propagate_mentor
  AFTER UPDATE OF mentor_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_propagate_mentor_to_enrollments();

-- ---------------------------------------------------------------------------
-- 5) Require mentor before submitting logbook / lesson work
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_enrollment_has_mentor_for_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m uuid;
BEGIN
  IF TG_TABLE_NAME = 'logbook_entries' THEN
    IF NEW.status = 'submitted' THEN
      m := public.enrollment_effective_mentor_id(NEW.user_training_id);
      IF m IS NULL THEN
        RAISE EXCEPTION 'Assign a mentor before submitting logbook entries'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'lesson_submissions' THEN
    IF NEW.status = 'submitted' AND NEW.submitted_at IS NOT NULL THEN
      m := public.enrollment_effective_mentor_id(NEW.user_training_id);
      IF m IS NULL THEN
        RAISE EXCEPTION 'Assign a mentor before submitting lesson work'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logbook_require_mentor_submit ON public.logbook_entries;
CREATE TRIGGER trg_logbook_require_mentor_submit
  BEFORE INSERT OR UPDATE OF status ON public.logbook_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_enrollment_has_mentor_for_submit();

DROP TRIGGER IF EXISTS trg_lesson_submissions_require_mentor_submit ON public.lesson_submissions;
CREATE TRIGGER trg_lesson_submissions_require_mentor_submit
  BEFORE INSERT OR UPDATE OF status, submitted_at ON public.lesson_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_enrollment_has_mentor_for_submit();

-- ---------------------------------------------------------------------------
-- 6) Notifications: mentor from profile-or-enrollment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_logbook_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentor_id uuid;
  v_trainee_user_id uuid;
  v_subject_name text;
BEGIN
  SELECT public.enrollment_effective_mentor_id(NEW.user_training_id), ut.user_id
  INTO v_mentor_id, v_trainee_user_id
  FROM public.user_trainings ut
  WHERE ut.id = NEW.user_training_id;

  IF v_mentor_id IS NULL AND v_trainee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'submitted'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'submitted')))
     AND v_mentor_id IS NOT NULL
  THEN
    SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), 'Apprentice') INTO v_subject_name
    FROM public.users u WHERE u.id = v_trainee_user_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_mentor_id,
      'logs_awaiting',
      v_trainee_user_id,
      COALESCE(v_subject_name, 'Apprentice'),
      NEW.id
    );
  END IF;

  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'approved')))
     AND v_trainee_user_id IS NOT NULL
  THEN
    SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), 'Mentor') INTO v_subject_name
    FROM public.users u WHERE u.id = NEW.approved_by LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_trainee_user_id,
      'logs_approved',
      NEW.approved_by,
      COALESCE(v_subject_name, 'Mentor'),
      NEW.id
    );
  END IF;

  IF NEW.status = 'rejected'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'rejected')))
     AND v_trainee_user_id IS NOT NULL
     AND v_mentor_id IS NOT NULL
  THEN
    SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), 'Mentor') INTO v_subject_name
    FROM public.users u WHERE u.id = v_mentor_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_trainee_user_id,
      'logs_rejected',
      v_mentor_id,
      COALESCE(v_subject_name, 'Mentor'),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_lesson_submission_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentor_id uuid;
  v_trainee_user_id uuid;
  v_subject_name text;
  v_mentor_name text;
BEGIN
  SELECT public.enrollment_effective_mentor_id(NEW.user_training_id), ut.user_id
  INTO v_mentor_id, v_trainee_user_id
  FROM public.user_trainings ut
  WHERE ut.id = NEW.user_training_id;

  IF v_mentor_id IS NULL AND v_trainee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.submitted_at IS NOT NULL
     AND NEW.status = 'submitted'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.submitted_at IS NULL OR OLD.status IS DISTINCT FROM 'submitted')))
     AND v_mentor_id IS NOT NULL
  THEN
    SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), 'Student') INTO v_subject_name
    FROM public.users u WHERE u.id = v_trainee_user_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_mentor_id,
      'lessons_awaiting',
      v_trainee_user_id,
      COALESCE(v_subject_name, 'Student'),
      NEW.id
    );
  END IF;

  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'approved'))
     AND v_trainee_user_id IS NOT NULL
     AND NEW.approved_by IS NOT NULL
  THEN
    SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), 'Mentor') INTO v_subject_name
    FROM public.users u WHERE u.id = NEW.approved_by LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_trainee_user_id,
      'lessons_approved',
      NEW.approved_by,
      COALESCE(v_subject_name, 'Mentor'),
      NEW.id
    );
  END IF;

  IF NEW.status = 'rejected'
     AND (TG_OP = 'INSERT' OR (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'rejected'))
     AND v_trainee_user_id IS NOT NULL
     AND v_mentor_id IS NOT NULL
  THEN
    SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), 'Mentor') INTO v_mentor_name
    FROM public.users u WHERE u.id = v_mentor_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_trainee_user_id,
      'lessons_rejected',
      v_mentor_id,
      COALESCE(v_mentor_name, 'Mentor'),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Logbook approve RPC: match canonical mentor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_logbook_entry(
  p_entry_id uuid,
  p_approver_id uuid,
  p_acs_code_ids integer[] DEFAULT '{}'::integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_training_id uuid;
  v_expected_mentor uuid;
  v_pending record;
BEGIN
  SELECT le.user_training_id,
         public.enrollment_effective_mentor_id(le.user_training_id)
  INTO v_user_training_id, v_expected_mentor
  FROM public.logbook_entries le
  WHERE le.id = p_entry_id;

  IF v_user_training_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF v_expected_mentor IS NULL OR v_expected_mentor <> p_approver_id THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  IF array_length(p_acs_code_ids, 1) > 0 THEN
    DELETE FROM public.logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;
    INSERT INTO public.logbook_entry_acs_pending (logbook_entry_id, acs_code_id)
    SELECT p_entry_id, unnest(p_acs_code_ids);
  END IF;

  INSERT INTO public.logbook_entry_acs (logbook_entry_id, acs_code_id)
  SELECT logbook_entry_id, acs_code_id
  FROM public.logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id;

  DELETE FROM public.logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;

  UPDATE public.logbook_entries
  SET status = 'approved',
      approved_by = p_approver_id,
      approved_at = NOW(),
      reject_reason = NULL
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Assign mentor (RLS-safe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_enrollment_mentor(
  p_user_training_id uuid,
  p_mentor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF p_mentor_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Mentor is required');
  END IF;

  SELECT tp.organization_id
  INTO v_org
  FROM public.user_trainings ut
  INNER JOIN public.training_paths tp ON tp.id = ut.training_path_id
  WHERE ut.id = p_user_training_id;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('error', 'Enrollment not found');
  END IF;

  IF NOT public.auth_is_platform_admin() THEN
    IF v_actor <> p_mentor_id THEN
      RETURN jsonb_build_object('error', 'Permission denied');
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_organizations uo
      WHERE uo.user_id = v_actor
        AND uo.organization_id = v_org
        AND uo.role = 'mentor'::text
    ) THEN
      RETURN jsonb_build_object('error', 'Not a mentor in this organization');
    END IF;
  END IF;

  UPDATE public.user_trainings
  SET mentor_id = p_mentor_id
  WHERE id = p_user_training_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_enrollment_mentor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_enrollment_mentor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_enrollment_mentor(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) RLS: managers no longer approve logbook rows (mentor or platform admin only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers and gods can approve all logbook entries" ON public.logbook_entries;

CREATE POLICY "Platform admin can approve logbook entries"
  ON public.logbook_entries
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

-- ---------------------------------------------------------------------------
-- 10) RLS: org managers view lesson submissions; only mentor or platform admin may approve
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Platform admin or org managers review lesson submissions" ON public.lesson_submissions;

CREATE POLICY "Platform admin may review lesson submissions"
  ON public.lesson_submissions
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

COMMIT;

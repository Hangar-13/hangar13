-- lesson_submissions: reviewed_* -> approved_* (parity with logbook_entries).
-- Drop acs_signoff; keep logbook_entry_acs_pending (student ACS tags pre-approval).
-- Remove ACS-specific notifications; add lesson submission notifications (mentor/student).
-- logbook_entry_acs_pending: still required for draft/submitted log lines before mentor approval
-- copies rows to logbook_entry_acs.

BEGIN;

COMMENT ON TABLE public.logbook_entry_acs_pending IS
  'ACS tag proposals for a logbook line before mentor approval; copied into logbook_entry_acs on approve. Keep this table.';

-- ---------------------------------------------------------------------------
-- 1. lesson_submissions: rename reviewed columns, fix FK
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_submissions DROP CONSTRAINT IF EXISTS weekly_submissions_reviewed_by_fkey;
ALTER TABLE public.lesson_submissions DROP CONSTRAINT IF EXISTS lesson_submissions_reviewed_by_fkey;

ALTER TABLE public.lesson_submissions RENAME COLUMN reviewed_by TO approved_by;
ALTER TABLE public.lesson_submissions RENAME COLUMN reviewed_at TO approved_at;

ALTER TABLE public.lesson_submissions
  ADD CONSTRAINT lesson_submissions_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lesson_submissions.approved_by IS 'Mentor (or admin) who approved this submission; mirrors logbook_entries.approved_by.';
COMMENT ON COLUMN public.lesson_submissions.approved_at IS 'When the submission was approved; set with approved_by.';

-- ---------------------------------------------------------------------------
-- 2. Drop explicit ACS sign-off table
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Mentors can insert acs_signoff for their students" ON public.acs_signoff;
DROP POLICY IF EXISTS "Mentors can insert acs_signoff for their apprentices" ON public.acs_signoff;
DROP POLICY IF EXISTS "Authenticated users can read acs_signoff" ON public.acs_signoff;

DROP TABLE IF EXISTS public.acs_signoff;
DROP SEQUENCE IF EXISTS public.acs_signoff_id_seq;

DROP FUNCTION IF EXISTS public.create_acs_signed_notification(uuid, uuid, text, text);

-- ---------------------------------------------------------------------------
-- 3. Notifications: remove acs_signed; add lesson types
-- ---------------------------------------------------------------------------
DELETE FROM public.notifications WHERE type = 'acs_signed';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (
    ARRAY[
      'logs_awaiting'::text,
      'logs_approved'::text,
      'logs_rejected'::text,
      'lessons_awaiting'::text,
      'lessons_approved'::text,
      'lessons_rejected'::text
    ]
  )
);

CREATE OR REPLACE FUNCTION public.create_or_stack_notification(
  p_recipient_user_id uuid,
  p_type text,
  p_subject_user_id uuid,
  p_subject_display_name text,
  p_log_entry_id uuid
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $fn$
DECLARE
  v_existing RECORD;
  v_new_ids UUID[];
  v_new_count INT;
  v_message TEXT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(NULLIF(TRIM(p_subject_display_name), ''), 'Unknown');

  SELECT id, log_count, log_entry_ids INTO v_existing
  FROM public.notifications
  WHERE recipient_user_id = p_recipient_user_id
    AND type = p_type
    AND subject_user_id = p_subject_user_id
  LIMIT 1;

  IF FOUND THEN
    v_new_ids := COALESCE(v_existing.log_entry_ids, ARRAY[]::UUID[]) || p_log_entry_id;
    v_new_count := array_length(v_new_ids, 1);
  ELSE
    v_new_ids := ARRAY[p_log_entry_id];
    v_new_count := 1;
  END IF;

  v_message := CASE p_type
    WHEN 'logs_awaiting' THEN
      CASE WHEN v_new_count = 1 THEN 'Log awaiting approval for ' || v_name
           ELSE v_new_count::TEXT || ' logs awaiting approval for ' || v_name END
    WHEN 'logs_approved' THEN
      CASE WHEN v_new_count = 1 THEN 'Log approved by ' || v_name
           ELSE v_new_count::TEXT || ' logs approved by ' || v_name END
    WHEN 'logs_rejected' THEN
      CASE WHEN v_new_count = 1 THEN 'Log rejected by ' || v_name
           ELSE v_new_count::TEXT || ' logs rejected by ' || v_name END
    WHEN 'lessons_awaiting' THEN
      CASE WHEN v_new_count = 1 THEN 'Lesson submission awaiting review for ' || v_name
           ELSE v_new_count::TEXT || ' lesson submissions awaiting review for ' || v_name END
    WHEN 'lessons_approved' THEN
      CASE WHEN v_new_count = 1 THEN 'Lesson submission approved by ' || v_name
           ELSE v_new_count::TEXT || ' lesson submissions approved by ' || v_name END
    WHEN 'lessons_rejected' THEN
      CASE WHEN v_new_count = 1 THEN 'Lesson submission rejected by ' || v_name
           ELSE v_new_count::TEXT || ' lesson submissions rejected by ' || v_name END
    ELSE ''
  END;

  -- FOUND is still from the initial SELECT into v_existing
  IF FOUND THEN
    UPDATE public.notifications
    SET
      log_count = v_new_count,
      log_entry_ids = v_new_ids,
      message = v_message,
      read_at = NULL,
      updated_at = NOW()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.notifications (
      recipient_user_id,
      type,
      subject_user_id,
      message,
      log_count,
      log_entry_ids
    ) VALUES (
      p_recipient_user_id,
      p_type,
      p_subject_user_id,
      v_message,
      v_new_count,
      v_new_ids
    );
  END IF;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Lesson submission notifications (mirror logbook pattern)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_lesson_submission_status_change() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $tr$
DECLARE
  v_mentor_id UUID;
  v_trainee_user_id UUID;
  v_subject_name TEXT;
  v_mentor_name TEXT;
BEGIN
  SELECT ut.mentor_id, ut.user_id INTO v_mentor_id, v_trainee_user_id
  FROM public.user_trainings ut
  WHERE ut.id = NEW.user_training_id;

  IF v_mentor_id IS NULL AND v_trainee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mentor: new submission to review
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

  -- Student: approved
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

  -- Student: rejected
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
$tr$;

DROP TRIGGER IF EXISTS trg_notify_on_lesson_submission_status ON public.lesson_submissions;
CREATE TRIGGER trg_notify_on_lesson_submission_status
  AFTER INSERT OR UPDATE ON public.lesson_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_lesson_submission_status_change();

COMMENT ON FUNCTION public.notify_on_lesson_submission_status_change() IS
  'Notifies mentor on new submitted lesson work and student on approve/reject.';

COMMIT;

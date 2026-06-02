-- Mentor/student discussion threads for "Questions for Mentor Discussion".
-- Each (enrollment, lesson, question_index) is a conversation thread. Posting a
-- message notifies the other participant; multiple messages on the same question
-- stack into a single notification (one per thread) that deep-links to the page.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. lesson_discussion_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_discussion_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_training_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  question_index integer NOT NULL,
  -- Snapshot of the question text at send time (questions are a text[] on the
  -- lesson with no stable id; this keeps context if a manager edits the array).
  question_text text,
  -- Program week (1-based path-expansion index) the sender was viewing; used to
  -- build deep links since program week is not derivable from lesson_id alone.
  program_week integer,
  sender_user_id uuid NOT NULL,
  body text NOT NULL,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT lesson_discussion_messages_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_discussion_messages_question_index_check CHECK (question_index >= 0),
  CONSTRAINT lesson_discussion_messages_user_training_id_fkey
    FOREIGN KEY (user_training_id) REFERENCES public.user_trainings (id) ON DELETE CASCADE,
  CONSTRAINT lesson_discussion_messages_sender_user_id_fkey
    FOREIGN KEY (sender_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lesson_discussion_messages_thread_idx
  ON public.lesson_discussion_messages (user_training_id, lesson_id, question_index, created_at);

CREATE INDEX IF NOT EXISTS lesson_discussion_messages_lesson_idx
  ON public.lesson_discussion_messages (user_training_id, lesson_id);

COMMENT ON TABLE public.lesson_discussion_messages IS
  'Messenger-style messages between a student and their mentor for a lesson discussion question.';

DROP TRIGGER IF EXISTS update_lesson_discussion_messages_updated_at ON public.lesson_discussion_messages;
CREATE TRIGGER update_lesson_discussion_messages_updated_at
  BEFORE UPDATE ON public.lesson_discussion_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Access helper (student owner or effective mentor of the enrollment)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_can_access_enrollment_discussion(p_user_training_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.auth_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_trainings ut
      LEFT JOIN public.users u ON u.id = ut.user_id
      WHERE ut.id = p_user_training_id
        AND (
          ut.user_id = auth.uid()
          OR COALESCE(u.mentor_id, ut.mentor_id) = auth.uid()
        )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_can_access_enrollment_discussion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_access_enrollment_discussion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_enrollment_discussion(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_discussion_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_discussion_messages_select ON public.lesson_discussion_messages;
CREATE POLICY lesson_discussion_messages_select
  ON public.lesson_discussion_messages
  FOR SELECT
  TO authenticated
  USING (public.auth_can_access_enrollment_discussion(user_training_id));

DROP POLICY IF EXISTS lesson_discussion_messages_insert ON public.lesson_discussion_messages;
CREATE POLICY lesson_discussion_messages_insert
  ON public.lesson_discussion_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.auth_can_access_enrollment_discussion(user_training_id)
  );

-- Edit / soft-delete: only the author may modify their own messages.
DROP POLICY IF EXISTS lesson_discussion_messages_update ON public.lesson_discussion_messages;
CREATE POLICY lesson_discussion_messages_update
  ON public.lesson_discussion_messages
  FOR UPDATE
  TO authenticated
  USING (sender_user_id = auth.uid())
  WITH CHECK (sender_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. notifications: discussion deep-link columns + per-thread stacking key
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_training_id uuid,
  ADD COLUMN IF NOT EXISTS lesson_id uuid,
  ADD COLUMN IF NOT EXISTS question_index integer,
  ADD COLUMN IF NOT EXISTS program_week integer;

-- Allow the new type.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (
    ARRAY[
      'logs_awaiting'::text,
      'logs_approved'::text,
      'logs_rejected'::text,
      'lessons_awaiting'::text,
      'lessons_approved'::text,
      'lessons_rejected'::text,
      'discussion_message'::text
    ]
  )
);

-- The original global unique (recipient, type, subject) constraint would collapse
-- all discussion threads from the same sender into one row. Replace it with
-- type-aware partial unique indexes so discussions stack per (lesson, question).
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_user_id_type_subject_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_type_subject_key
  ON public.notifications (recipient_user_id, type, subject_user_id)
  WHERE type <> 'discussion_message';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_discussion_thread_key
  ON public.notifications (recipient_user_id, user_training_id, lesson_id, question_index)
  WHERE type = 'discussion_message';

-- ---------------------------------------------------------------------------
-- 5. Stacking RPC for discussion notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_or_stack_discussion_notification(
  p_recipient_user_id uuid,
  p_sender_user_id uuid,
  p_sender_display_name text,
  p_user_training_id uuid,
  p_lesson_id uuid,
  p_question_index integer,
  p_program_week integer,
  p_message_id uuid
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
DECLARE
  v_existing RECORD;
  v_new_ids uuid[];
  v_new_count int;
  v_message text;
  v_name text;
BEGIN
  IF p_recipient_user_id IS NULL OR p_recipient_user_id = p_sender_user_id THEN
    RETURN;
  END IF;

  v_name := COALESCE(NULLIF(TRIM(p_sender_display_name), ''), 'Someone');

  SELECT id, log_entry_ids INTO v_existing
  FROM public.notifications
  WHERE recipient_user_id = p_recipient_user_id
    AND type = 'discussion_message'
    AND user_training_id = p_user_training_id
    AND lesson_id = p_lesson_id
    AND question_index = p_question_index
  LIMIT 1;

  IF FOUND THEN
    v_new_ids := COALESCE(v_existing.log_entry_ids, ARRAY[]::uuid[]) || p_message_id;
    v_new_count := array_length(v_new_ids, 1);
  ELSE
    v_new_ids := ARRAY[p_message_id];
    v_new_count := 1;
  END IF;

  v_message := CASE
    WHEN v_new_count = 1 THEN v_name || ' sent you a message about a discussion question'
    ELSE v_name || ' sent you ' || v_new_count::text || ' messages about a discussion question'
  END;

  IF FOUND THEN
    UPDATE public.notifications
    SET
      subject_user_id = p_sender_user_id,
      message = v_message,
      log_count = v_new_count,
      log_entry_ids = v_new_ids,
      program_week = p_program_week,
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
      log_entry_ids,
      user_training_id,
      lesson_id,
      question_index,
      program_week
    ) VALUES (
      p_recipient_user_id,
      'discussion_message',
      p_sender_user_id,
      v_message,
      v_new_count,
      v_new_ids,
      p_user_training_id,
      p_lesson_id,
      p_question_index,
      p_program_week
    );
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_or_stack_discussion_notification(uuid, uuid, text, uuid, uuid, integer, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_stack_discussion_notification(uuid, uuid, text, uuid, uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_stack_discussion_notification(uuid, uuid, text, uuid, uuid, integer, integer, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Trigger: notify the other participant on a new message
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_discussion_message() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $tr$
DECLARE
  v_student_user_id uuid;
  v_mentor_id uuid;
  v_recipient uuid;
  v_sender_name text;
BEGIN
  SELECT ut.user_id, COALESCE(u.mentor_id, ut.mentor_id)
    INTO v_student_user_id, v_mentor_id
  FROM public.user_trainings ut
  LEFT JOIN public.users u ON u.id = ut.user_id
  WHERE ut.id = NEW.user_training_id;

  -- Sender is the student -> notify the mentor; otherwise notify the student.
  IF NEW.sender_user_id = v_student_user_id THEN
    v_recipient := v_mentor_id;
  ELSE
    v_recipient := v_student_user_id;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), 'Someone') INTO v_sender_name
  FROM public.users u WHERE u.id = NEW.sender_user_id LIMIT 1;

  PERFORM public.create_or_stack_discussion_notification(
    v_recipient,
    NEW.sender_user_id,
    v_sender_name,
    NEW.user_training_id,
    NEW.lesson_id,
    NEW.question_index,
    NEW.program_week,
    NEW.id
  );

  RETURN NEW;
END;
$tr$;

DROP TRIGGER IF EXISTS trg_notify_on_discussion_message ON public.lesson_discussion_messages;
CREATE TRIGGER trg_notify_on_discussion_message
  AFTER INSERT ON public.lesson_discussion_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_discussion_message();

COMMENT ON FUNCTION public.notify_on_discussion_message() IS
  'Notifies the other discussion participant when a new message is posted; stacks per (enrollment, lesson, question).';

-- ---------------------------------------------------------------------------
-- 7. Read RPC: thread + participants (bypasses users RLS for participant names)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lesson_discussion(
  p_user_training_id uuid,
  p_lesson_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
DECLARE
  v_student_user_id uuid;
  v_mentor_id uuid;
  v_viewer_role text;
  v_student jsonb;
  v_mentor jsonb;
  v_messages jsonb;
BEGIN
  IF NOT public.auth_can_access_enrollment_discussion(p_user_training_id) THEN
    RAISE EXCEPTION 'Not authorized to view this discussion';
  END IF;

  SELECT ut.user_id, COALESCE(u.mentor_id, ut.mentor_id)
    INTO v_student_user_id, v_mentor_id
  FROM public.user_trainings ut
  LEFT JOIN public.users u ON u.id = ut.user_id
  WHERE ut.id = p_user_training_id;

  IF auth.uid() = v_student_user_id THEN
    v_viewer_role := 'student';
  ELSIF auth.uid() = v_mentor_id THEN
    v_viewer_role := 'mentor';
  ELSE
    -- platform admin / other authorized viewer acts in the mentor seat
    v_viewer_role := 'mentor';
  END IF;

  SELECT jsonb_build_object(
    'id', u.id, 'full_name', u.full_name, 'avatar_url', u.avatar_url
  ) INTO v_student
  FROM public.users u WHERE u.id = v_student_user_id;

  SELECT jsonb_build_object(
    'id', u.id, 'full_name', u.full_name, 'avatar_url', u.avatar_url
  ) INTO v_mentor
  FROM public.users u WHERE u.id = v_mentor_id;

  SELECT COALESCE(jsonb_agg(m ORDER BY m.created_at), '[]'::jsonb) INTO v_messages
  FROM (
    SELECT
      dm.id,
      dm.user_training_id,
      dm.lesson_id,
      dm.question_index,
      dm.sender_user_id,
      CASE WHEN dm.deleted_at IS NULL THEN dm.body ELSE NULL END AS body,
      dm.edited_at,
      dm.deleted_at,
      dm.created_at,
      dm.updated_at
    FROM public.lesson_discussion_messages dm
    WHERE dm.user_training_id = p_user_training_id
      AND dm.lesson_id = p_lesson_id
    ORDER BY dm.created_at
  ) m;

  RETURN jsonb_build_object(
    'viewer_role', v_viewer_role,
    'viewer_id', auth.uid(),
    'student', v_student,
    'mentor', v_mentor,
    'messages', v_messages
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_lesson_discussion(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_discussion(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lesson_discussion(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_discussion_messages;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

COMMIT;

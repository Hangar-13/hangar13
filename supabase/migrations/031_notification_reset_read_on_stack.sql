-- When stacking new log events into an existing notification, clear read_at
-- so the updated notification shows up again (new content = unread).
CREATE OR REPLACE FUNCTION public.create_or_stack_notification(
  p_recipient_user_id UUID,
  p_type TEXT,
  p_subject_user_id UUID,
  p_subject_display_name TEXT,
  p_log_entry_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    ELSE ''
  END;

  IF FOUND THEN
    UPDATE public.notifications
    SET
      log_count = v_new_count,
      log_entry_ids = v_new_ids,
      message = v_message,
      read_at = NULL,  -- New content added = show as unread again
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
$$;

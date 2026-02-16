-- Create notifications via database triggers so they always fire regardless of app code path.
-- This ensures notifications are created when logbook entries are submitted, approved, or rejected.

CREATE OR REPLACE FUNCTION public.notify_on_logbook_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentor_id UUID;
  v_apprentice_user_id UUID;
  v_subject_name TEXT;
  v_recipient_id UUID;
  v_subject_id UUID;
BEGIN
  -- Get apprentice's mentor and user_id
  SELECT a.mentor_id, a.user_id INTO v_mentor_id, v_apprentice_user_id
  FROM public.apprentices a
  WHERE a.id = NEW.apprentice_id;

  IF v_mentor_id IS NULL AND v_apprentice_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Status changed to 'submitted' -> notify mentor
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'submitted'))) AND v_mentor_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Apprentice') INTO v_subject_name
    FROM public.profiles p WHERE p.id = v_apprentice_user_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_mentor_id,
      'logs_awaiting',
      v_apprentice_user_id,
      COALESCE(v_subject_name, 'Apprentice'),
      NEW.id
    );
  END IF;

  -- Status changed to 'approved' -> notify apprentice
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'approved'))) AND v_apprentice_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Mentor') INTO v_subject_name
    FROM public.profiles p WHERE p.id = NEW.approved_by LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_apprentice_user_id,
      'logs_approved',
      NEW.approved_by,
      COALESCE(v_subject_name, 'Mentor'),
      NEW.id
    );
  END IF;

  -- Status changed to 'rejected' -> notify apprentice (mentor is the one who rejected)
  IF NEW.status = 'rejected' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'rejected'))) AND v_apprentice_user_id IS NOT NULL AND v_mentor_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Mentor') INTO v_subject_name
    FROM public.profiles p WHERE p.id = v_mentor_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_apprentice_user_id,
      'logs_rejected',
      v_mentor_id,
      COALESCE(v_subject_name, 'Mentor'),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logbook_notify_on_insert ON public.logbook_entries;
CREATE TRIGGER trg_logbook_notify_on_insert
  AFTER INSERT ON public.logbook_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_logbook_status_change();

DROP TRIGGER IF EXISTS trg_logbook_notify_on_update ON public.logbook_entries;
CREATE TRIGGER trg_logbook_notify_on_update
  AFTER UPDATE ON public.logbook_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_logbook_status_change();

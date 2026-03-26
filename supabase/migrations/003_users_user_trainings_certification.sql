-- Rename profiles -> users, apprentices -> user_trainings; add certification enum.
-- Renames apprentice_id -> user_training_id on dependent tables.
-- Drops per-user uniqueness on trainings so one user can have multiple program enrollments later.

-- ---------------------------------------------------------------------------
-- 1. Drop RLS policies (expressions reference old table/column names)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Apprentices can manage own logbook entries" ON public.logbook_entries;
DROP POLICY IF EXISTS "Apprentices can manage own logbook entry ACS pending" ON public.logbook_entry_acs_pending;
DROP POLICY IF EXISTS "Apprentices can manage own progress" ON public.apprentice_progress;
DROP POLICY IF EXISTS "Apprentices can manage own submissions" ON public.weekly_submissions;
DROP POLICY IF EXISTS "Apprentices can read own logbook entry acs" ON public.logbook_entry_acs;
DROP POLICY IF EXISTS "Apprentices can view mentor profile" ON public.profiles;
DROP POLICY IF EXISTS "Apprentices can view own record" ON public.apprentices;
DROP POLICY IF EXISTS "Apprentices can view own submission files" ON public.weekly_submission_files;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can read acs_code" ON public.acs_code;
DROP POLICY IF EXISTS "Authenticated users can read acs_signoff" ON public.acs_signoff;
DROP POLICY IF EXISTS "Authenticated users can read ata_chapter" ON public.ata_chapter;
DROP POLICY IF EXISTS "Authenticated users can view curriculum items" ON public.curriculum_items;
DROP POLICY IF EXISTS "Authenticated users can view training plan weeks" ON public.training_plan_weeks;
DROP POLICY IF EXISTS "Authenticated users can view training plans" ON public.training_plans;
DROP POLICY IF EXISTS "Gods can update manager roles" ON public.profiles;
DROP POLICY IF EXISTS "Managers and gods can approve all logbook entries" ON public.logbook_entries;
DROP POLICY IF EXISTS "Managers and gods can manage all apprentice progress" ON public.apprentice_progress;
DROP POLICY IF EXISTS "Managers and gods can review all submissions" ON public.weekly_submissions;
DROP POLICY IF EXISTS "Managers and gods can view all apprentices" ON public.apprentices;
DROP POLICY IF EXISTS "Managers and gods can view all logbook entries" ON public.logbook_entries;
DROP POLICY IF EXISTS "Managers and gods can view all submission files" ON public.weekly_submission_files;
DROP POLICY IF EXISTS "Managers and gods can view all submissions" ON public.weekly_submissions;
DROP POLICY IF EXISTS "Managers can update apprentice and mentor roles" ON public.profiles;
DROP POLICY IF EXISTS "Mentors and above can manage curriculum items" ON public.curriculum_items;
DROP POLICY IF EXISTS "Mentors and above can manage training plan weeks" ON public.training_plan_weeks;
DROP POLICY IF EXISTS "Mentors and above can manage training plans" ON public.training_plans;
DROP POLICY IF EXISTS "Mentors can approve logbook entries" ON public.logbook_entries;
DROP POLICY IF EXISTS "Mentors can insert acs_signoff for their apprentices" ON public.acs_signoff;
DROP POLICY IF EXISTS "Mentors can manage apprentice progress" ON public.apprentice_progress;
DROP POLICY IF EXISTS "Mentors can read apprentice logbook entry acs" ON public.logbook_entry_acs;
DROP POLICY IF EXISTS "Mentors can review apprentice submissions" ON public.weekly_submissions;
DROP POLICY IF EXISTS "Mentors can view all apprentice logbook entries for assignment" ON public.logbook_entries;
DROP POLICY IF EXISTS "Mentors can view all apprentices for assignment" ON public.apprentices;
DROP POLICY IF EXISTS "Mentors can view apprentice logbook entries" ON public.logbook_entries;
DROP POLICY IF EXISTS "Mentors can view apprentice logbook entry ACS pending" ON public.logbook_entry_acs_pending;
DROP POLICY IF EXISTS "Mentors can view apprentice profiles" ON public.profiles;
DROP POLICY IF EXISTS "Mentors can view apprentice submission files" ON public.weekly_submission_files;
DROP POLICY IF EXISTS "Mentors can view apprentice submissions" ON public.weekly_submissions;
DROP POLICY IF EXISTS "Mentors can view their apprentices" ON public.apprentices;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications (mark read)" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- ---------------------------------------------------------------------------
-- 2. Rename tables and columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles RENAME TO users;

ALTER TABLE public.apprentices RENAME TO user_trainings;

CREATE TYPE public.certification AS ENUM ('FAA_AP', 'FAA_A', 'FAA_P', 'other');

ALTER TABLE public.user_trainings
  ADD COLUMN certification public.certification NOT NULL DEFAULT 'FAA_AP';

ALTER TABLE public.user_trainings DROP CONSTRAINT IF EXISTS apprentices_user_id_key;

ALTER TABLE public.logbook_entries RENAME COLUMN apprentice_id TO user_training_id;
ALTER TABLE public.apprentice_progress RENAME COLUMN apprentice_id TO user_training_id;
ALTER TABLE public.weekly_submissions RENAME COLUMN apprentice_id TO user_training_id;

ALTER INDEX public.idx_apprentices_mentor_id RENAME TO idx_user_trainings_mentor_id;
ALTER INDEX public.idx_apprentices_status RENAME TO idx_user_trainings_status;
ALTER INDEX public.idx_apprentices_training_plan_id RENAME TO idx_user_trainings_training_plan_id;
ALTER INDEX public.idx_apprentices_user_id RENAME TO idx_user_trainings_user_id;
ALTER INDEX public.idx_logbook_entries_apprentice_id RENAME TO idx_logbook_entries_user_training_id;
ALTER INDEX public.idx_apprentice_progress_apprentice_id RENAME TO idx_apprentice_progress_user_training_id;
ALTER INDEX public.idx_weekly_submissions_apprentice_id RENAME TO idx_weekly_submissions_user_training_id;

ALTER TABLE public.apprentice_progress RENAME CONSTRAINT apprentice_progress_apprentice_id_curriculum_item_id_key TO apprentice_progress_user_training_id_curriculum_item_id_key;
ALTER TABLE public.weekly_submissions RENAME CONSTRAINT weekly_submissions_apprentice_id_week_number_key TO weekly_submissions_user_training_id_week_number_key;

ALTER TRIGGER update_profiles_updated_at ON public.users RENAME TO update_users_updated_at;
ALTER TRIGGER update_apprentices_updated_at ON public.user_trainings RENAME TO update_user_trainings_updated_at;

-- ---------------------------------------------------------------------------
-- 3. Functions (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_logbook_entry(p_entry_id uuid, p_approver_id uuid, p_acs_code_ids integer[] DEFAULT '{}'::integer[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_training_id UUID;
  v_mentor_id UUID;
  v_pending RECORD;
BEGIN
  SELECT le.user_training_id, ut.mentor_id INTO v_user_training_id, v_mentor_id
  FROM logbook_entries le
  JOIN user_trainings ut ON ut.id = le.user_training_id
  WHERE le.id = p_entry_id;

  IF v_user_training_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF v_mentor_id != p_approver_id THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  IF array_length(p_acs_code_ids, 1) > 0 THEN
    DELETE FROM logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;
    INSERT INTO logbook_entry_acs_pending (logbook_entry_id, acs_code_id)
    SELECT p_entry_id, unnest(p_acs_code_ids);
  END IF;

  INSERT INTO logbook_entry_acs (logbook_entry_id, acs_code_id)
  SELECT logbook_entry_id, acs_code_id
  FROM logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id;

  DELETE FROM logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;

  UPDATE logbook_entries
  SET status = 'approved',
      approved_by = p_approver_id,
      approved_at = NOW(),
      reject_reason = NULL
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
    profile_id UUID;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'apprentice');

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role
    )
    RETURNING id INTO profile_id;

    INSERT INTO public.user_trainings (user_id, start_date, status, certification)
    SELECT NEW.id, CURRENT_DATE, 'active', 'FAA_AP'::public.certification
    WHERE NOT EXISTS (SELECT 1 FROM public.user_trainings ut WHERE ut.user_id = NEW.id);

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_mentor() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'mentor'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_logbook_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mentor_id UUID;
  v_trainee_user_id UUID;
  v_subject_name TEXT;
BEGIN
  SELECT ut.mentor_id, ut.user_id INTO v_mentor_id, v_trainee_user_id
  FROM public.user_trainings ut
  WHERE ut.id = NEW.user_training_id;

  IF v_mentor_id IS NULL AND v_trainee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'submitted'))) AND v_mentor_id IS NOT NULL THEN
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

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'approved'))) AND v_trainee_user_id IS NOT NULL THEN
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

  IF NEW.status = 'rejected' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'rejected'))) AND v_trainee_user_id IS NOT NULL AND v_mentor_id IS NOT NULL THEN
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

-- ---------------------------------------------------------------------------
-- 4. RLS policies (recreate with users / user_trainings / user_training_id)
-- ---------------------------------------------------------------------------

CREATE POLICY "Apprentices can manage own logbook entries" ON public.logbook_entries USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = logbook_entries.user_training_id) AND (ut.user_id = auth.uid())))));

CREATE POLICY "Apprentices can manage own logbook entry ACS pending" ON public.logbook_entry_acs_pending USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.user_trainings ut ON ((ut.id = le.user_training_id)))
  WHERE ((le.id = logbook_entry_acs_pending.logbook_entry_id) AND (ut.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.user_trainings ut ON ((ut.id = le.user_training_id)))
  WHERE ((le.id = logbook_entry_acs_pending.logbook_entry_id) AND (ut.user_id = auth.uid())))));

CREATE POLICY "Apprentices can manage own progress" ON public.apprentice_progress USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = apprentice_progress.user_training_id) AND (ut.user_id = auth.uid())))));

CREATE POLICY "Apprentices can manage own submissions" ON public.weekly_submissions USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = weekly_submissions.user_training_id) AND (ut.user_id = auth.uid())))));

CREATE POLICY "Apprentices can read own logbook entry acs" ON public.logbook_entry_acs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.user_trainings ut ON ((ut.id = le.user_training_id)))
  WHERE ((le.id = logbook_entry_acs.logbook_entry_id) AND (ut.user_id = auth.uid())))));

CREATE POLICY "Apprentices can view mentor profile" ON public.users FOR SELECT USING ((id IN ( SELECT ut.mentor_id
   FROM public.user_trainings ut
  WHERE ((ut.user_id = auth.uid()) AND (ut.mentor_id IS NOT NULL)))));

CREATE POLICY "Apprentices can view own record" ON public.user_trainings FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Apprentices can view own submission files" ON public.weekly_submission_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.weekly_submissions ws
     JOIN public.user_trainings ut ON ((ut.id = ws.user_training_id)))
  WHERE ((ws.id = weekly_submission_files.submission_id) AND (ut.user_id = auth.uid())))));

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can read acs_code" ON public.acs_code FOR SELECT USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can read acs_signoff" ON public.acs_signoff FOR SELECT USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can read ata_chapter" ON public.ata_chapter FOR SELECT USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can view curriculum items" ON public.curriculum_items FOR SELECT USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Authenticated users can view training plan weeks" ON public.training_plan_weeks FOR SELECT USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Authenticated users can view training plans" ON public.training_plans FOR SELECT USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Gods can update manager roles" ON public.users FOR UPDATE USING ((
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'god'::text)
  AND (role = 'manager'::text)
));

CREATE POLICY "Managers and gods can approve all logbook entries" ON public.logbook_entries FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'god'::text]))))));

CREATE POLICY "Managers and gods can manage all apprentice progress" ON public.apprentice_progress USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'god'::text]))))));

CREATE POLICY "Managers and gods can review all submissions" ON public.weekly_submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'god'::text]))))));

CREATE POLICY "Managers and gods can view all apprentices" ON public.user_trainings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'god'::text]))))));

CREATE POLICY "Managers and gods can view all logbook entries" ON public.logbook_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'god'::text]))))));

CREATE POLICY "Managers and gods can view all submission files" ON public.weekly_submission_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'god'::text]))))));

CREATE POLICY "Managers and gods can view all submissions" ON public.weekly_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'god'::text]))))));

CREATE POLICY "Managers can update apprentice and mentor roles" ON public.users FOR UPDATE USING ((
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text]))
  AND (role = ANY (ARRAY['apprentice'::text, 'mentor'::text]))
));

CREATE POLICY "Mentors and above can manage curriculum items" ON public.curriculum_items USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text]))))));

CREATE POLICY "Mentors and above can manage training plan weeks" ON public.training_plan_weeks USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text]))))));

CREATE POLICY "Mentors and above can manage training plans" ON public.training_plans USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text]))))));

CREATE POLICY "Mentors can approve logbook entries" ON public.logbook_entries FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = logbook_entries.user_training_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can insert acs_signoff for their apprentices" ON public.acs_signoff FOR INSERT WITH CHECK (((auth.uid() = signer_id) AND (EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.user_id = acs_signoff.apprentice_user_id) AND (ut.mentor_id = acs_signoff.signer_id))))));

CREATE POLICY "Mentors can manage apprentice progress" ON public.apprentice_progress USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = apprentice_progress.user_training_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can read apprentice logbook entry acs" ON public.logbook_entry_acs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.user_trainings ut ON ((ut.id = le.user_training_id)))
  WHERE ((le.id = logbook_entry_acs.logbook_entry_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can review apprentice submissions" ON public.weekly_submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = weekly_submissions.user_training_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can view all apprentice logbook entries for assignment" ON public.logbook_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'mentor'::text)))));

CREATE POLICY "Mentors can view all apprentices for assignment" ON public.user_trainings FOR SELECT USING (public.is_mentor());

CREATE POLICY "Mentors can view apprentice logbook entries" ON public.logbook_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = logbook_entries.user_training_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can view apprentice logbook entry ACS pending" ON public.logbook_entry_acs_pending FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.user_trainings ut ON ((ut.id = le.user_training_id)))
  WHERE ((le.id = logbook_entry_acs_pending.logbook_entry_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can view apprentice profiles" ON public.users FOR SELECT USING ((public.is_mentor() AND (role = 'apprentice'::text)));

CREATE POLICY "Mentors can view apprentice submission files" ON public.weekly_submission_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.weekly_submissions ws
     JOIN public.user_trainings ut ON ((ut.id = ws.user_training_id)))
  WHERE ((ws.id = weekly_submission_files.submission_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can view apprentice submissions" ON public.weekly_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_trainings ut
  WHERE ((ut.id = weekly_submissions.user_training_id) AND (ut.mentor_id = auth.uid())))));

CREATE POLICY "Mentors can view their apprentices" ON public.user_trainings FOR SELECT USING ((auth.uid() = mentor_id));

CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING ((auth.uid() = recipient_user_id));

CREATE POLICY "Users can update own notifications (mark read)" ON public.notifications FOR UPDATE USING ((auth.uid() = recipient_user_id)) WITH CHECK ((auth.uid() = recipient_user_id));

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = recipient_user_id));

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING ((auth.uid() = id));

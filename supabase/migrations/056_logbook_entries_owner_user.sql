-- Logbook entries belong to public.users (trainee), not enrollments (user_trainings).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Column: owner user + backfill + drop enrollment FK
-- ---------------------------------------------------------------------------
ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS user_id uuid;

COMMENT ON COLUMN public.logbook_entries.user_id IS
  'Trainee who owns this logbook row; independent of training enrollments.';

-- Dynamic SQL so this migration can run when user_training_id is already gone: a static UPDATE
-- would still be validated/planned against the current catalog and can error with 42703.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'logbook_entries'
      AND column_name = 'user_training_id'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.logbook_entries le
      SET user_id = ut.user_id
      FROM public.user_trainings ut
      WHERE ut.id = le.user_training_id
        AND le.user_id IS NULL
    $backfill$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.logbook_entries WHERE user_id IS NULL) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'logbook_entries'
        AND column_name = 'user_training_id'
    ) THEN
      RAISE EXCEPTION 'logbook_entries: backfill user_id failed (orphan user_training_id?)'
        USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION
        'logbook_entries: user_id is NULL but user_training_id column is gone; repair rows or restore backup'
        USING ERRCODE = '23514';
    END IF;
  END IF;
END $$;

ALTER TABLE public.logbook_entries
  ALTER COLUMN user_id SET NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.logbook_entries'::regclass
      AND c.contype = 'f'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%user_trainings%'
        OR c.conname IN (
          'logbook_entries_apprentice_id_fkey',
          'logbook_entries_user_training_id_fkey'
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE public.logbook_entries DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.idx_logbook_entries_user_training_id;

-- ---------------------------------------------------------------------------
-- 2) RLS: logbook_entries + ACS tables (must run BEFORE dropping user_training_id;
--    Postgres records policy dependencies on columns used in expressions.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Apprentices can manage own logbook entries" ON public.logbook_entries;
CREATE POLICY "Apprentices can manage own logbook entries"
  ON public.logbook_entries
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Mentors can approve logbook entries" ON public.logbook_entries;
CREATE POLICY "Mentors can approve logbook entries"
  ON public.logbook_entries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users trainee
      WHERE trainee.id = logbook_entries.user_id
        AND trainee.mentor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users trainee
      WHERE trainee.id = logbook_entries.user_id
        AND trainee.mentor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Mentors can view apprentice logbook entries" ON public.logbook_entries;
CREATE POLICY "Mentors can view apprentice logbook entries"
  ON public.logbook_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users trainee
      WHERE trainee.id = logbook_entries.user_id
        AND trainee.mentor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Apprentices can manage own logbook entry ACS pending" ON public.logbook_entry_acs_pending;
CREATE POLICY "Apprentices can manage own logbook entry ACS pending"
  ON public.logbook_entry_acs_pending
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      WHERE le.id = logbook_entry_acs_pending.logbook_entry_id
        AND le.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      WHERE le.id = logbook_entry_acs_pending.logbook_entry_id
        AND le.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Apprentices can read own logbook entry acs" ON public.logbook_entry_acs;
CREATE POLICY "Apprentices can read own logbook entry acs"
  ON public.logbook_entry_acs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      WHERE le.id = logbook_entry_acs.logbook_entry_id
        AND le.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Mentors can read apprentice logbook entry acs" ON public.logbook_entry_acs;
CREATE POLICY "Mentors can read apprentice logbook entry acs"
  ON public.logbook_entry_acs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      INNER JOIN public.users trainee ON trainee.id = le.user_id
      WHERE le.id = logbook_entry_acs.logbook_entry_id
        AND trainee.mentor_id = auth.uid()
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
      INNER JOIN public.users trainee ON trainee.id = le.user_id
      WHERE le.id = logbook_entry_acs_pending.logbook_entry_id
        AND trainee.mentor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Users RLS: reviewer visibility via logbook (before drop column)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view reviewers linked to own training rows" ON public.users;
CREATE POLICY "Users can view reviewers linked to own training rows"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      WHERE le.user_id = auth.uid()
        AND le.approved_by = users.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_submissions ls
      INNER JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ut.user_id = auth.uid()
        AND ls.approved_by = users.id
    )
  );

DROP POLICY IF EXISTS "Mentors can view reviewers for assigned mentees" ON public.users;
CREATE POLICY "Mentors can view reviewers for assigned mentees"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      INNER JOIN public.users trainee ON trainee.id = le.user_id
      WHERE trainee.mentor_id = auth.uid()
        AND le.approved_by = users.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_submissions ls
      INNER JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ut.mentor_id = auth.uid()
        AND ls.approved_by = users.id
    )
  );

-- ---------------------------------------------------------------------------
-- 2b) Drop enrollment column + add owner FK (after policies no longer reference it)
-- ---------------------------------------------------------------------------
ALTER TABLE public.logbook_entries DROP COLUMN IF EXISTS user_training_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'logbook_entries_user_id_fkey'
  ) THEN
    ALTER TABLE public.logbook_entries
      ADD CONSTRAINT logbook_entries_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_logbook_entries_user_id
  ON public.logbook_entries USING btree (user_id);

-- ---------------------------------------------------------------------------
-- 4) Mentor for logbook sign-off: canonical trainee.users.mentor_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trainee_effective_mentor_id(p_trainee_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT u.mentor_id
  FROM public.users u
  WHERE u.id = p_trainee_user_id;
$$;

REVOKE ALL ON FUNCTION public.trainee_effective_mentor_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trainee_effective_mentor_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainee_effective_mentor_id(uuid) TO service_role;

COMMENT ON FUNCTION public.trainee_effective_mentor_id(uuid) IS
  'Mentor user id for trainee logbook/notifications: users.mentor_id only (no enrollment).';

-- ---------------------------------------------------------------------------
-- 5) Notify on logbook status
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
  v_trainee_user_id := NEW.user_id;
  v_mentor_id := public.trainee_effective_mentor_id(v_trainee_user_id);

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

-- ---------------------------------------------------------------------------
-- 6) Invisible mentor auto-sign on submit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logbook_before_submit_invisible_auto_sign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainee uuid;
  v_mentor uuid;
  v_vis boolean;
  v_name text;
  v_ct text;
  v_cn text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;

  v_trainee := NEW.user_id;

  IF v_trainee IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT u.mentor_id INTO v_mentor
  FROM public.users u
  WHERE u.id = v_trainee;

  IF v_mentor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT u.visible,
    u.full_name,
    u.mechanic_certificate_type,
    u.mechanic_certificate_number
  INTO v_vis, v_name, v_ct, v_cn
  FROM public.users u
  WHERE u.id = v_mentor;

  IF COALESCE(v_vis, true) IS true THEN
    RETURN NEW;
  END IF;

  NEW.status := 'approved';
  NEW.approved_by := v_mentor;
  NEW.approved_at := NOW();
  NEW.submitted_at := COALESCE(NEW.submitted_at, NOW());
  NEW.signature_text := public.format_logbook_signature_line(
    v_name,
    COALESCE(v_ct, 'A&P'),
    v_cn,
    CURRENT_DATE
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Sync pending ACS after auto-approve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_logbook_pending_acs_to_approved(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_owner uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_actor := auth.uid();

  SELECT le.user_id, le.status
  INTO v_owner, v_status
  FROM public.logbook_entries le
  WHERE le.id = p_entry_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF v_owner IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  IF v_status IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true);
  END IF;

  INSERT INTO public.logbook_entry_acs (logbook_entry_id, acs_code_id)
  SELECT logbook_entry_id, acs_code_id
  FROM public.logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id
  ON CONFLICT (logbook_entry_id, acs_code_id) DO NOTHING;

  DELETE FROM public.logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.sync_logbook_pending_acs_to_approved(uuid) IS
  'Copy pending ACS to approved when entry is approved; caller must own the logbook row (user_id).';

-- ---------------------------------------------------------------------------
-- 8) Approve logbook RPC (expected mentor from trainee profile)
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
  v_owner uuid;
  v_expected_mentor uuid;
  v_name text;
  v_ct text;
  v_cn text;
BEGIN
  SELECT le.user_id,
    public.trainee_effective_mentor_id(le.user_id)
  INTO v_owner, v_expected_mentor
  FROM public.logbook_entries le
  WHERE le.id = p_entry_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF v_expected_mentor IS NULL OR v_expected_mentor <> p_approver_id THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  IF cardinality(coalesce(p_acs_code_ids, '{}'::integer[])) > 0 THEN
    DELETE FROM public.logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;
    INSERT INTO public.logbook_entry_acs_pending (logbook_entry_id, acs_code_id)
    SELECT p_entry_id, unnest(p_acs_code_ids);
  END IF;

  INSERT INTO public.logbook_entry_acs (logbook_entry_id, acs_code_id)
  SELECT logbook_entry_id, acs_code_id
  FROM public.logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id;

  DELETE FROM public.logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;

  SELECT u.full_name,
    u.mechanic_certificate_type,
    u.mechanic_certificate_number
  INTO v_name, v_ct, v_cn
  FROM public.users u
  WHERE u.id = p_approver_id;

  UPDATE public.logbook_entries
  SET status = 'approved',
      approved_by = p_approver_id,
      approved_at = NOW(),
      reject_reason = NULL,
      signature_text = public.format_logbook_signature_line(
        v_name,
        coalesce(v_ct, 'A&P'),
        v_cn,
        CURRENT_DATE
      )
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;

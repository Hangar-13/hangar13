-- Logbook mentor signing: mechanic certificate fields, signature line, invisible mentor auto-sign,
-- optional submit without mentor (no notification / no signature). Lesson submissions still require mentor.

BEGIN;

DROP FUNCTION IF EXISTS public.claim_external_mentor_for_self(text, text);

-- ---------------------------------------------------------------------------
-- 1) Mechanic certificate on users (for signature lines)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mechanic_certificate_type text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mechanic_certificate_number text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_mechanic_certificate_type_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_mechanic_certificate_type_check CHECK (
    mechanic_certificate_type IS NULL
    OR mechanic_certificate_type = ANY (ARRAY['A'::text, 'P'::text, 'A&P'::text])
  );

COMMENT ON COLUMN public.users.mechanic_certificate_type IS
  'FAA mechanic rating for signatures: A, P, or A&P.';
COMMENT ON COLUMN public.users.mechanic_certificate_number IS
  'Certificate number shown on logbook signatures.';

-- ---------------------------------------------------------------------------
-- 2) Stored signature line on logbook row
-- ---------------------------------------------------------------------------
ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS signature_text text;

COMMENT ON COLUMN public.logbook_entries.signature_text IS
  'Formatted signature line: Name (A|P|A&P cert#) date. Set when signed (mentor or auto invisible).';

-- ---------------------------------------------------------------------------
-- 3) Format helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.format_logbook_signature_line(
  p_full_name text,
  p_cert_type text,
  p_cert_number text,
  p_signed_on date
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_ct text;
  v_cn text;
  v_date text;
BEGIN
  v_name := COALESCE(NULLIF(btrim(p_full_name), ''), 'Unknown');
  v_ct := COALESCE(NULLIF(btrim(p_cert_type), ''), 'A&P');
  v_cn := NULLIF(btrim(p_cert_number), '');
  v_date := to_char(COALESCE(p_signed_on, CURRENT_DATE), 'FMMonth DD, YYYY');
  IF v_cn IS NULL THEN
    RETURN format('%s (%s) %s', v_name, v_ct, v_date);
  END IF;
  RETURN format('%s (%s %s) %s', v_name, v_ct, v_cn, v_date);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Drop mandatory-mentor check for logbook (keep for lesson_submissions)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_logbook_require_mentor_submit ON public.logbook_entries;

CREATE OR REPLACE FUNCTION public.assert_enrollment_has_mentor_for_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m uuid;
BEGIN
  IF TG_TABLE_NAME = 'lesson_submissions' THEN
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

-- ---------------------------------------------------------------------------
-- 5) Before submit: invisible mentor rows auto-approve with signature
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

  SELECT ut.user_id INTO v_trainee
  FROM public.user_trainings ut
  WHERE ut.id = NEW.user_training_id;

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

DROP TRIGGER IF EXISTS trg_logbook_invisible_mentor_auto_sign ON public.logbook_entries;
CREATE TRIGGER trg_logbook_invisible_mentor_auto_sign
  BEFORE INSERT OR UPDATE OF status ON public.logbook_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.logbook_before_submit_invisible_auto_sign();

COMMENT ON FUNCTION public.logbook_before_submit_invisible_auto_sign() IS
  'When a student submits (status=submitted) and users.mentor_id is invisible, approve immediately with signature_text.';

-- ---------------------------------------------------------------------------
-- 6) Copy pending ACS to approved (student-owned entry just auto-approved)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_logbook_pending_acs_to_approved(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ut uuid;
  v_uid uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_uid := auth.uid();

  SELECT le.user_training_id, le.status
  INTO v_ut, v_status
  FROM public.logbook_entries le
  WHERE le.id = p_entry_id;

  IF v_ut IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_trainings ut
    WHERE ut.id = v_ut AND ut.user_id = v_uid
  ) THEN
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

REVOKE ALL ON FUNCTION public.sync_logbook_pending_acs_to_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_logbook_pending_acs_to_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_logbook_pending_acs_to_approved(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Mentor search (limited columns; includes non-visible mentors)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_mechanic_mentors(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  full_name text,
  mechanic_certificate_type text,
  mechanic_certificate_number text,
  visible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lim int := greatest(1, least(40, coalesce(p_limit, 20)));
  v_q text := btrim(coalesce(p_query, ''));
  v_pat text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_q = '' THEN
    RETURN;
  END IF;

  v_pat := '%' || v_q || '%';

  RETURN QUERY
  SELECT
    u.id,
    u.full_name,
    u.mechanic_certificate_type,
    u.mechanic_certificate_number,
    u.visible
  FROM public.users u
  WHERE (
      u.full_name ILIKE v_pat
      OR u.mechanic_certificate_number ILIKE v_pat
      OR u.email ILIKE v_pat
    )
    AND (
      u.mechanic_certificate_number IS NOT NULL AND btrim(u.mechanic_certificate_number) <> ''
      OR u.visible = false
    )
  ORDER BY u.full_name ASC NULLS LAST
  LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION public.search_mechanic_mentors(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_mechanic_mentors(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_mechanic_mentors(text, int) TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Assign mentor on own profile (trainee)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_self_mentor(p_mentor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF p_mentor_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Mentor id required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_mentor_id) THEN
    RETURN jsonb_build_object('error', 'Mentor not found');
  END IF;

  IF p_mentor_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Invalid mentor');
  END IF;

  UPDATE public.users
  SET mentor_id = p_mentor_id
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_self_mentor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_self_mentor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_self_mentor(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) Create invisible mechanic mentor and assign to self
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_external_mentor_for_self(
  p_first_name text,
  p_last_name text,
  p_mechanic_cert_type text,
  p_mechanic_cert_number text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_fn text := btrim(coalesce(p_first_name, ''));
  v_ln text := btrim(coalesce(p_last_name, ''));
  v_full text;
  v_ct text := btrim(upper(coalesce(p_mechanic_cert_type, '')));
  v_cn text := btrim(coalesce(p_mechanic_cert_number, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_fn = '' OR v_ln = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_full := v_fn || ' ' || v_ln;

  IF v_ct NOT IN ('A', 'P', 'A&P') THEN
    RAISE EXCEPTION 'invalid_cert_type' USING ERRCODE = '22023';
  END IF;

  IF v_cn = '' THEN
    RAISE EXCEPTION 'invalid_cert_number' USING ERRCODE = '22023';
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    visible,
    platform_elevation,
    mechanic_certificate_type,
    mechanic_certificate_number
  )
  VALUES (
    v_id,
    NULL,
    v_full,
    'guest',
    false,
    NULL,
    v_ct,
    v_cn
  );

  UPDATE public.users
  SET mentor_id = v_id
  WHERE id = auth.uid();

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_external_mentor_for_self(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_external_mentor_for_self(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_external_mentor_for_self(text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.claim_external_mentor_for_self(text, text, text, text) IS
  'Trainee: insert visible=false mentor persona with A/P/A&P + cert #; set as users.mentor_id.';

-- ---------------------------------------------------------------------------
-- 10) Approve logbook: set formatted signature
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
  v_name text;
  v_ct text;
  v_cn text;
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

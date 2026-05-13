-- Trainees with a mechanic certificate number may clear users.mentor_id for any mentor.
-- Trainees without a cert may still only clear non-directory (visible = false) mentors.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_logbook_mentor_display_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mid uuid;
  m RECORD;
  v_trainee_cert text;
  v_trainee_has_cert boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated.');
  END IF;

  SELECT u.mechanic_certificate_number INTO v_trainee_cert
  FROM public.users u
  WHERE u.id = v_uid;

  v_trainee_has_cert :=
    v_trainee_cert IS NOT NULL AND btrim(v_trainee_cert) <> '';

  SELECT u.mentor_id INTO v_mid
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_mid IS NULL THEN
    RETURN jsonb_build_object(
      'hasAssignedMentor', false,
      'mentor', null,
      'traineeHasMechanicCertificateNumber', v_trainee_has_cert
    );
  END IF;

  SELECT
    x.id,
    x.full_name,
    x.mechanic_certificate_type,
    x.mechanic_certificate_number,
    x.visible
  INTO m
  FROM public.users x
  WHERE x.id = v_mid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'hasAssignedMentor', false,
      'mentor', null,
      'traineeHasMechanicCertificateNumber', v_trainee_has_cert
    );
  END IF;

  RETURN jsonb_build_object(
    'hasAssignedMentor', true,
    'traineeHasMechanicCertificateNumber', v_trainee_has_cert,
    'mentor', jsonb_build_object(
      'id', m.id,
      'full_name', m.full_name,
      'mechanic_certificate_type', m.mechanic_certificate_type,
      'mechanic_certificate_number', m.mechanic_certificate_number,
      'visible', m.visible
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_invisible_assigned_mentor_for_self()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mid uuid;
  v_vis boolean;
  v_trainee_cert text;
  v_trainee_has_cert boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT u.mentor_id INTO v_mid
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_mid IS NULL THEN
    RETURN jsonb_build_object('error', 'No mentor assigned');
  END IF;

  SELECT u.mechanic_certificate_number INTO v_trainee_cert
  FROM public.users u
  WHERE u.id = v_uid;

  v_trainee_has_cert :=
    v_trainee_cert IS NOT NULL AND btrim(v_trainee_cert) <> '';

  IF NOT v_trainee_has_cert THEN
    SELECT u.visible INTO v_vis
    FROM public.users u
    WHERE u.id = v_mid;

    IF v_vis IS DISTINCT FROM false THEN
      RETURN jsonb_build_object(
        'error',
        'Only external mentors can be removed until you add a mechanic certificate number to your profile.'
      );
    END IF;
  END IF;

  UPDATE public.users
  SET mentor_id = NULL
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.clear_invisible_assigned_mentor_for_self() IS
  'Clears auth.uid() users.mentor_id: always if trainee has mechanic_certificate_number; otherwise only when mentor.visible = false.';

COMMIT;

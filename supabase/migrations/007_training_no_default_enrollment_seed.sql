-- New signups: no automatic user_trainings row; no default current_curriculum_id (see 010 for column name).
-- Seed one training program for the catalog (dummy / placeholder using existing copy).

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'apprentice');

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role
    );

    RETURN NEW;
END;
$$;

-- Idempotent catalog seed (fixed id for ON CONFLICT).
INSERT INTO public.training_plans (id, name, description, total_weeks, is_active)
VALUES (
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'FAA A&P Certification',
    'Airframe and Powerplant mechanic certification aligned with FAA ACS knowledge, risk management, and skill standards. Includes General (Section I) plus Airframe and/or Powerplant sections based on your selected track.',
    130,
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    total_weeks = EXCLUDED.total_weeks,
    is_active = EXCLUDED.is_active;

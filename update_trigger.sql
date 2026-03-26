-- Legacy one-off: prefer supabase/migrations (handle_new_user in 003 + 004).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
    v_training_id UUID;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'apprentice');

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role
    );

    INSERT INTO public.user_trainings (user_id, start_date, status)
    SELECT NEW.id, CURRENT_DATE, 'active'
    WHERE NOT EXISTS (SELECT 1 FROM public.user_trainings ut WHERE ut.user_id = NEW.id)
    RETURNING id INTO v_training_id;

    IF v_training_id IS NULL THEN
        SELECT ut.id INTO v_training_id
        FROM public.user_trainings ut
        WHERE ut.user_id = NEW.id
        ORDER BY ut.created_at ASC
        LIMIT 1;
    END IF;

    IF v_training_id IS NOT NULL THEN
        UPDATE public.users SET current_user_training_id = v_training_id WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

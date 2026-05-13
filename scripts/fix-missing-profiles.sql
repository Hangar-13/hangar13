-- Fix users who signed up but don't have users / user_trainings records.
-- Run in Supabase SQL Editor after migrations.

INSERT INTO public.users (id, email, full_name, role)
SELECT
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    COALESCE(u.raw_user_meta_data->>'role', 'student')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p.id = u.id);

INSERT INTO public.user_trainings (user_id, start_date, status)
SELECT
    p.id,
    CURRENT_DATE,
    'active'
FROM public.users p
WHERE NOT EXISTS (SELECT 1 FROM public.user_trainings ut WHERE ut.user_id = p.id);

UPDATE public.users u
SET current_user_training_id = (
  SELECT ut.id FROM public.user_trainings ut
  WHERE ut.user_id = u.id
  ORDER BY ut.created_at ASC
  LIMIT 1
)
WHERE u.current_user_training_id IS NULL
  AND EXISTS (SELECT 1 FROM public.user_trainings ut WHERE ut.user_id = u.id);

SELECT
    u.id,
    u.email,
    p.full_name,
    p.role,
    ut.id AS user_training_id,
    p.current_user_training_id,
    p.current_certification
FROM auth.users u
LEFT JOIN public.users p ON p.id = u.id
LEFT JOIN public.user_trainings ut ON ut.user_id = p.id
ORDER BY u.created_at DESC;

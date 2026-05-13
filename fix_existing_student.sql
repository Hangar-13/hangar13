-- Backfill missing user_trainings rows for student-role users (Supabase SQL Editor).

INSERT INTO public.user_trainings (user_id, start_date, status)
SELECT
    p.id AS user_id,
    CURRENT_DATE AS start_date,
    'active' AS status
FROM public.users p
WHERE p.role = 'student'
  AND NOT EXISTS (SELECT 1 FROM public.user_trainings ut WHERE ut.user_id = p.id);

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
    p.id,
    p.email,
    p.role,
    ut.id AS user_training_id,
    p.current_user_training_id
FROM public.users p
LEFT JOIN public.user_trainings ut ON ut.user_id = p.id
WHERE p.role = 'student';

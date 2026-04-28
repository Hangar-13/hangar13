-- Progress is derived from lesson_submissions + catalog lessons (see lib/training-progress.ts).

DROP POLICY IF EXISTS "Apprentices can manage own progress" ON public.apprentice_progress;
DROP POLICY IF EXISTS "Managers and gods can manage all apprentice progress" ON public.apprentice_progress;
DROP POLICY IF EXISTS "Mentors can manage apprentice progress" ON public.apprentice_progress;

DROP TABLE IF EXISTS public.apprentice_progress;

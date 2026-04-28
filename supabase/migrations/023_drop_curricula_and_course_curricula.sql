-- Remove unused tagging tables. Program assignment and catalogs use training_paths + training_path_items instead.

-- Junction references curricula; drop it first
DROP TABLE IF EXISTS public.course_curricula;

DROP TABLE IF EXISTS public.curricula;

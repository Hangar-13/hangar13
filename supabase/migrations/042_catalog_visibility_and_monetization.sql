-- Visibility (training_paths = student/marketplace; courses = manager lifecycle)
-- + path monetization. See plan: visibility_and_access_v2.

BEGIN;

CREATE TYPE public.catalog_visibility AS ENUM (
  'draft',
  'unreleased',
  'proprietary',
  'public'
);

COMMENT ON TYPE public.catalog_visibility IS
  'Path: student discovery. Course: manager lifecycle (draft / peer review / path-builder / cross-org).';

CREATE TYPE public.path_monetization AS ENUM (
  'free',
  'one_time',
  'subscription'
);

COMMENT ON TYPE public.path_monetization IS
  'How a training path is sold; enrollment still requires checkout + grant (including free).';

-- ---------------------------------------------------------------------------
-- training_paths
-- ---------------------------------------------------------------------------
ALTER TABLE public.training_paths
  ADD COLUMN IF NOT EXISTS visibility public.catalog_visibility NOT NULL DEFAULT 'public';

ALTER TABLE public.training_paths
  ADD COLUMN IF NOT EXISTS monetization public.path_monetization NOT NULL DEFAULT 'free';

COMMENT ON COLUMN public.training_paths.visibility IS
  'draft=author+platform admin; unreleased=manager+ in org (not mentor/student); proprietary=any org member; public=any authenticated user.';
COMMENT ON COLUMN public.training_paths.monetization IS
  'Pricing model; free paths still require checkout to create access grant + enrollment.';

-- ---------------------------------------------------------------------------
-- courses (manager lifecycle; students discover via paths)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS visibility public.catalog_visibility NOT NULL DEFAULT 'proprietary';

COMMENT ON COLUMN public.courses.visibility IS
  'Manager workflow: draft=author only; unreleased=manager+ review (not in path pickers); proprietary=may add to training_path_items; public=cross-org manager catalogs (optional).';

COMMIT;

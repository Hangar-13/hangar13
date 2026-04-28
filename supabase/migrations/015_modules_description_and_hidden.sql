-- Optional module description for managers; hide module shell from learners (single default bucket).
ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_hidden_from_users boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.modules.is_hidden_from_users IS
  'When true, learners see lessons under the course without this module as a visible grouping.';

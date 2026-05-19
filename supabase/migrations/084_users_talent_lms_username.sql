-- Optional Talent LMS login when REST lookup by Hangar email/username heuristics fails.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS talent_lms_username text;

COMMENT ON COLUMN public.users.talent_lms_username IS
  'When set, Hangar uses this exact Talent LMS username for progress/API lookups (GET /users/username:…) before inferring from email.';

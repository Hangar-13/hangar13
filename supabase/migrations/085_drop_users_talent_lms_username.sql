-- Hangar policy: Talent LMS learner login matches Hangar email; no separate override column.
ALTER TABLE public.users
  DROP COLUMN IF EXISTS talent_lms_username;

-- Optional TalentLMS course ID: when set + TALENTLMS_API_KEY, Hangar enrollment triggers API enroll on Talent.

ALTER TABLE public.training_paths
  ADD COLUMN IF NOT EXISTS talent_lms_course_id text;

COMMENT ON COLUMN public.training_paths.talent_lms_course_id IS
  'Talent LMS course id (numeric string, e.g. 126). Used with TALENTLMS_API_KEY to enroll learners via REST when they enroll on this path in Hangar.';

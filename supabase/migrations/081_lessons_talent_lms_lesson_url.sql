ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS talent_lms_lesson_url text;

COMMENT ON COLUMN public.lessons.talent_lms_lesson_url IS
  'Direct Talent LMS learner URL for this lesson (https://*.talentlms.com/...). Used for Start lesson and API course/unit resolution; separate from study_materials markdown.';

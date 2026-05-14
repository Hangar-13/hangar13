-- Replace full Talent URL with unit id only; URL is built from TALENTLMS_SUBDOMAIN + path course id.

ALTER TABLE public.lessons DROP COLUMN IF EXISTS talent_lms_lesson_url;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS talent_lms_unit_id text;

COMMENT ON COLUMN public.lessons.talent_lms_unit_id IS
  'TalentLMS unit id for this lesson (digits). Play URL = https://{TALENTLMS_SUBDOMAIN}.talentlms.com/course/play/id:{path course}/unit:{id}.';

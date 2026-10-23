-- One-off wipe: remove all courses, modules, lessons, and related progress
-- so the catalog looks like it never existed.
--
-- NOT a migration — do not add this to supabase/migrations.
--
-- Keeps: users, organizations, training_paths (emptied of items), logbook,
-- credentials, ACS/ATA catalogs.
--
-- Run against the linked remote:
--   npx supabase db query --linked --yes -f scripts/wipe-course-catalog.sql

BEGIN;

-- Lesson discussion has no FK to lessons; clear it first.
DELETE FROM public.lesson_discussion_messages;

-- Lesson/course notifications (keep logbook notifications).
DELETE FROM public.notifications
WHERE type IN (
  'lessons_awaiting',
  'lessons_approved',
  'lessons_rejected',
  'discussion_message'
);

-- Completions recorded for Hangar programs built from these courses.
DELETE FROM public.user_training_completions;

-- Snapshot + catalog + submissions in one TRUNCATE so RESTRICT FKs
-- (course_version_lessons.source_lesson_id, course_version_pins.course_version_id)
-- are satisfied together.
TRUNCATE TABLE
  public.lesson_submission_files,
  public.lesson_submissions,
  public.course_version_pins,
  public.course_version_lessons,
  public.course_version_modules,
  public.course_versions,
  public.training_path_items,
  public.lessons,
  public.modules,
  public.courses
RESTART IDENTITY CASCADE;

-- Enrollments remain on (now empty) training paths, but with no course work.
UPDATE public.user_trainings
SET
  hours_completed = 0,
  end_date = CASE WHEN status = 'completed' THEN NULL ELSE end_date END,
  status = CASE WHEN status = 'completed' THEN 'active' ELSE status END;

UPDATE public.training_paths
SET total_hours = 0;

COMMIT;

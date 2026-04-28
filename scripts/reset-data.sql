-- Reset data: drop all log records and users for a fresh start.
-- Keeps: schema, acs_code, ata_chapter, courses, training_paths, modules, lessons, etc.
--
-- How to run:
-- 1. Local Supabase: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/reset-data.sql
--    (Or get the DB URL from: supabase status)
-- 2. Hosted: Supabase Dashboard > SQL Editor > paste this file > Run

BEGIN;

-- 1. Logbook-related (order matters for FKs)
DELETE FROM public.logbook_entry_acs_pending;
DELETE FROM public.logbook_entry_acs;
DELETE FROM public.logbook_entries;

-- 2. ACS signoffs (reference users)

-- 3. Notifications
DELETE FROM public.notifications;

-- 4. Lesson submissions (files first)
DELETE FROM public.lesson_submission_files;
DELETE FROM public.lesson_submissions;

-- 5b. Credential history (references users)
DELETE FROM public.user_training_completions;
DELETE FROM public.user_certification_awards;

-- 6. Training path catalog (items before paths)
DELETE FROM public.training_path_items;
DELETE FROM public.training_paths;

-- 7. User trainings (enrollments in courses / paths)
DELETE FROM public.user_trainings;

-- 8. Users (references auth.users)
DELETE FROM public.users;

-- 9. Auth users (Supabase Auth)
--    Local: works. Hosted: may need Dashboard > Authentication > Users > delete each,
--    or use service_role connection in SQL Editor.
DELETE FROM auth.users;

COMMIT;

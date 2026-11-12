-- Courseware revision numbers. The zip for an old revision is not kept unless a
-- published course version still points at it. Completions keep the revision
-- number after the file is replaced.

BEGIN;

ALTER TABLE public.lessons
    ADD COLUMN IF NOT EXISTS courseware_revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.lessons
    DROP CONSTRAINT IF EXISTS lessons_courseware_revision_nonnegative;

ALTER TABLE public.lessons
    ADD CONSTRAINT lessons_courseware_revision_nonnegative
        CHECK (courseware_revision >= 0);

COMMENT ON COLUMN public.lessons.courseware_revision IS
    'Current courseware revision. 0 means none uploaded. Increments on each courseware upload.';

ALTER TABLE public.course_version_lessons
    ADD COLUMN IF NOT EXISTS courseware_revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.course_version_lessons
    DROP CONSTRAINT IF EXISTS course_version_lessons_courseware_revision_nonnegative;

ALTER TABLE public.course_version_lessons
    ADD CONSTRAINT course_version_lessons_courseware_revision_nonnegative
        CHECK (courseware_revision >= 0);

COMMENT ON COLUMN public.course_version_lessons.courseware_revision IS
    'Courseware revision captured when this course version was published.';

UPDATE public.lessons
SET courseware_revision = 1
WHERE content_package_id IS NOT NULL
  AND courseware_revision = 0;

UPDATE public.course_version_lessons
SET courseware_revision = 1
WHERE content_package_id IS NOT NULL
  AND courseware_revision = 0;

ALTER TABLE public.lesson_player_attempts
    ADD COLUMN IF NOT EXISTS lesson_id uuid,
    ADD COLUMN IF NOT EXISTS courseware_revision integer;

UPDATE public.lesson_player_attempts AS a
SET lesson_id = p.lesson_id,
    courseware_revision = CASE
        WHEN p.kind = 'content' THEN l.courseware_revision
        ELSE a.courseware_revision
    END
FROM public.lesson_packages AS p
JOIN public.lessons AS l ON l.id = p.lesson_id
WHERE a.package_id = p.id
  AND a.lesson_id IS NULL;

ALTER TABLE public.lesson_player_attempts
    DROP CONSTRAINT IF EXISTS lesson_player_attempts_lesson_id_fkey;

ALTER TABLE public.lesson_player_attempts
    ADD CONSTRAINT lesson_player_attempts_lesson_id_fkey
        FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE public.lesson_player_attempts
    DROP CONSTRAINT IF EXISTS lesson_player_attempts_courseware_revision_nonnegative;

ALTER TABLE public.lesson_player_attempts
    ADD CONSTRAINT lesson_player_attempts_courseware_revision_nonnegative
        CHECK (courseware_revision IS NULL OR courseware_revision >= 1);

-- Keep the completion row when an unreferenced courseware file is removed.
ALTER TABLE public.lesson_player_attempts
    ALTER COLUMN package_id DROP NOT NULL;

ALTER TABLE public.lesson_player_attempts
    DROP CONSTRAINT IF EXISTS lesson_player_attempts_package_id_fkey;

ALTER TABLE public.lesson_player_attempts
    ADD CONSTRAINT lesson_player_attempts_package_id_fkey
        FOREIGN KEY (package_id) REFERENCES public.lesson_packages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lesson_player_attempts.courseware_revision IS
    'Courseware revision this sitting was played against. Kept after the file is replaced.';

COMMIT;

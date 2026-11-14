-- Accumulated time from earlier sittings of a lesson package. The current
-- sitting stays in session_time until the next launch folds it in.
-- cmi.core.total_time is rebuilt from this column for the SCORM package.

BEGIN;

ALTER TABLE public.lesson_player_attempts
    ADD COLUMN IF NOT EXISTS total_time_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.lesson_player_attempts
    ADD COLUMN IF NOT EXISTS open_sitting_id uuid;

ALTER TABLE public.lesson_player_attempts
    DROP CONSTRAINT IF EXISTS lesson_player_attempts_total_time_seconds_nonnegative;

ALTER TABLE public.lesson_player_attempts
    ADD CONSTRAINT lesson_player_attempts_total_time_seconds_nonnegative
        CHECK (total_time_seconds >= 0);

COMMENT ON COLUMN public.lesson_player_attempts.total_time_seconds IS
    'Seconds spent in earlier sittings of this package. session_time is the current sitting and is added here when the package is opened again.';

COMMENT ON COLUMN public.lesson_player_attempts.open_sitting_id IS
    'Identifies the sitting currently open in the player. Commits from an earlier sitting are ignored so time is not added twice.';

COMMENT ON COLUMN public.lesson_player_attempts.session_time IS
    'SCORM 1.2 cmi.core.session_time for the sitting in progress, as HHHH:MM:SS.SS.';

COMMIT;

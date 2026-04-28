-- Lessons: ATA chapter rows (ata_chapter.id) this lesson covers.
-- Legacy text column ata_chapter remains for existing tools; app uses ata_chapter_ids.
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS ata_chapter_ids integer[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.lessons.ata_chapter_ids IS 'ATA chapter row ids (ata_chapter.id) for this lesson.';

CREATE INDEX IF NOT EXISTS idx_lessons_ata_chapter_ids ON public.lessons USING gin (ata_chapter_ids);

UPDATE public.lessons l
SET ata_chapter_ids = m.ids
FROM (
  SELECT
    l2.id,
    COALESCE(
      (
        SELECT ARRAY[ac.id]
        FROM public.ata_chapter ac
        WHERE l2.ata_chapter IS NOT NULL
          AND btrim(l2.ata_chapter) <> ''
          AND (
            btrim(ac.chapter_number) = btrim(l2.ata_chapter)
            OR btrim(ac.chapter_number) = lpad(btrim(l2.ata_chapter), 2, '0')
          )
        ORDER BY ac.chapter_number
        LIMIT 1
      ),
      '{}'::integer[]
    ) AS ids
  FROM public.lessons l2
) m
WHERE l.id = m.id
  AND l.ata_chapter IS NOT NULL
  AND btrim(l.ata_chapter) <> '';

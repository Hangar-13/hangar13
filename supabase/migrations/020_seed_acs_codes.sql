-- Seed ACS codes for every ATA chapter (5 codes per chapter: K1, K2, R1, S1, S2)
INSERT INTO public.acs_code (code, type, description, ata_chapter_id)
SELECT
  'AM.' || ac.chapter_number || '.' || v.code_suffix,
  v.type,
  v.description_prefix || ac.chapter_number,
  ac.id
FROM public.ata_chapter ac
CROSS JOIN (
  VALUES
    ('K1', 'K', 'Knowledge of systems and components related to ATA chapter '),
    ('K2', 'K', 'Knowledge of inspection and maintenance practices for ATA chapter '),
    ('R1', 'R', 'Risk management considerations for ATA chapter '),
    ('S1', 'S', 'Skill: perform inspection tasks for ATA chapter '),
    ('S2', 'S', 'Skill: perform troubleshooting tasks for ATA chapter ')
) AS v(code_suffix, type, description_prefix);

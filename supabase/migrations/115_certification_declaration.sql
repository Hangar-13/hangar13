-- A user can hold an A or P certificate and still be an apprentice.
-- certification_declared_at records that they answered the certificate
-- and apprentice questions. Breaks stay in the database; this form no longer edits them.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS certification_declared_at timestamp with time zone;

COMMENT ON COLUMN public.users.certification_declared_at IS
  'When the user saved their certificate and apprentice choice. Null until they answer.';

COMMENT ON COLUMN public.users.is_apprentice IS
  'True when the user is in an apprenticeship. An A or P certificate can still be an apprentice. A full A&P is not.';

-- Earlier certificate entry stored a number without a type and displayed it as A&P.
UPDATE public.users
SET mechanic_certificate_type = 'A&P'
WHERE mechanic_certificate_type IS NULL
  AND mechanic_certificate_number IS NOT NULL
  AND btrim(mechanic_certificate_number) <> '';

UPDATE public.users
SET certification_declared_at = now()
WHERE certification_declared_at IS NULL
  AND (
    is_apprentice = true
    OR (
      mechanic_certificate_number IS NOT NULL
      AND btrim(mechanic_certificate_number) <> ''
    )
  );

COMMIT;

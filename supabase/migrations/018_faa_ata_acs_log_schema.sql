-- FAA ATA chapters, ACS codes, log entries, and sign-offs schema
-- This migration adds new tables for aviation training tracking

-- ata_chapter
CREATE TABLE IF NOT EXISTS public.ata_chapter (
    id SERIAL PRIMARY KEY,
    chapter_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT
);

-- acs_code
CREATE TABLE IF NOT EXISTS public.acs_code (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('K', 'R', 'S')),
    description TEXT,
    ata_chapter_id INTEGER NOT NULL REFERENCES public.ata_chapter(id)
);

CREATE INDEX IF NOT EXISTS idx_acs_code_ata_chapter_id ON public.acs_code(ata_chapter_id);

-- app_user (distinct from auth.users - application-level user records)
CREATE TABLE IF NOT EXISTS public.app_user (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
);

-- organization
CREATE TABLE IF NOT EXISTS public.organization (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT
);

-- aircraft
CREATE TABLE IF NOT EXISTS public.aircraft (
    id SERIAL PRIMARY KEY,
    manufacturer TEXT,
    model TEXT,
    tail_number TEXT,
    category TEXT
);

-- user_organization_role
CREATE TABLE IF NOT EXISTS public.user_organization_role (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.app_user(id),
    organization_id INTEGER NOT NULL REFERENCES public.organization(id),
    role TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE
);

CREATE INDEX IF NOT EXISTS idx_user_org_role_user_id ON public.user_organization_role(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_role_organization_id ON public.user_organization_role(organization_id);

-- certification
CREATE TABLE IF NOT EXISTS public.certification (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.app_user(id),
    type TEXT NOT NULL,
    issued_at DATE NOT NULL,
    expires_at DATE
);

CREATE INDEX IF NOT EXISTS idx_certification_user_id ON public.certification(user_id);

-- log_entry
CREATE TABLE IF NOT EXISTS public.log_entry (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.app_user(id),
    organization_id INTEGER REFERENCES public.organization(id),
    aircraft_id INTEGER REFERENCES public.aircraft(id),
    ata_chapter_id INTEGER NOT NULL REFERENCES public.ata_chapter(id),
    performed_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER NOT NULL,
    role_at_time TEXT NOT NULL,
    was_certified_at_time BOOLEAN NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_log_entry_user_id ON public.log_entry(user_id);
CREATE INDEX IF NOT EXISTS idx_log_entry_organization_id ON public.log_entry(organization_id);
CREATE INDEX IF NOT EXISTS idx_log_entry_aircraft_id ON public.log_entry(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_log_entry_ata_chapter_id ON public.log_entry(ata_chapter_id);
CREATE INDEX IF NOT EXISTS idx_log_entry_performed_at ON public.log_entry(performed_at);

-- log_entry_acs (junction table: log entries can have multiple ACS codes)
CREATE TABLE IF NOT EXISTS public.log_entry_acs (
    id SERIAL PRIMARY KEY,
    log_entry_id INTEGER NOT NULL REFERENCES public.log_entry(id) ON DELETE CASCADE,
    acs_code_id INTEGER NOT NULL REFERENCES public.acs_code(id),
    UNIQUE (log_entry_id, acs_code_id)
);

CREATE INDEX IF NOT EXISTS idx_log_entry_acs_log_entry_id ON public.log_entry_acs(log_entry_id);
CREATE INDEX IF NOT EXISTS idx_log_entry_acs_acs_code_id ON public.log_entry_acs(acs_code_id);

-- log_entry_signoff (one signoff per log entry)
CREATE TABLE IF NOT EXISTS public.log_entry_signoff (
    id SERIAL PRIMARY KEY,
    log_entry_id INTEGER NOT NULL REFERENCES public.log_entry(id) ON DELETE CASCADE,
    signer_id INTEGER NOT NULL REFERENCES public.app_user(id),
    signed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT,
    UNIQUE (log_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_log_entry_signoff_log_entry_id ON public.log_entry_signoff(log_entry_id);
CREATE INDEX IF NOT EXISTS idx_log_entry_signoff_signer_id ON public.log_entry_signoff(signer_id);

-- acs_signoff (one signoff per ACS code per apprentice)
CREATE TABLE IF NOT EXISTS public.acs_signoff (
    id SERIAL PRIMARY KEY,
    acs_code_id INTEGER NOT NULL REFERENCES public.acs_code(id),
    apprentice_user_id INTEGER NOT NULL REFERENCES public.app_user(id),
    signer_id INTEGER NOT NULL REFERENCES public.app_user(id),
    signed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT,
    UNIQUE (acs_code_id, apprentice_user_id)
);

CREATE INDEX IF NOT EXISTS idx_acs_signoff_acs_code_id ON public.acs_signoff(acs_code_id);
CREATE INDEX IF NOT EXISTS idx_acs_signoff_apprentice_user_id ON public.acs_signoff(apprentice_user_id);
CREATE INDEX IF NOT EXISTS idx_acs_signoff_signer_id ON public.acs_signoff(signer_id);

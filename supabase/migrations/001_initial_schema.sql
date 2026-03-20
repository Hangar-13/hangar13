--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: approve_logbook_entry(uuid, uuid, integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_logbook_entry(p_entry_id uuid, p_approver_id uuid, p_acs_code_ids integer[] DEFAULT '{}'::integer[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_apprentice_id UUID;
  v_mentor_id UUID;
  v_pending RECORD;
BEGIN
  -- Verify mentor permission
  SELECT le.apprentice_id, a.mentor_id INTO v_apprentice_id, v_mentor_id
  FROM logbook_entries le
  JOIN apprentices a ON a.id = le.apprentice_id
  WHERE le.id = p_entry_id;

  IF v_apprentice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF v_mentor_id != p_approver_id THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  -- Update pending ACS if ids provided (mentor may have edited)
  IF array_length(p_acs_code_ids, 1) > 0 THEN
    DELETE FROM logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;
    INSERT INTO logbook_entry_acs_pending (logbook_entry_id, acs_code_id)
    SELECT p_entry_id, unnest(p_acs_code_ids);
  END IF;

  -- Copy pending to approved
  INSERT INTO logbook_entry_acs (logbook_entry_id, acs_code_id)
  SELECT logbook_entry_id, acs_code_id
  FROM logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id;

  -- Remove from pending
  DELETE FROM logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;

  -- Update entry status
  UPDATE logbook_entries
  SET status = 'approved',
      approved_by = p_approver_id,
      approved_at = NOW(),
      reject_reason = NULL
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: create_acs_signed_notification(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_acs_signed_notification(p_recipient_user_id uuid, p_subject_user_id uuid, p_subject_display_name text, p_message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_count INT;
BEGIN
  INSERT INTO public.notifications (
    recipient_user_id,
    type,
    subject_user_id,
    message,
    log_count,
    log_entry_ids
  ) VALUES (
    p_recipient_user_id,
    'acs_signed',
    p_subject_user_id,
    COALESCE(NULLIF(TRIM(p_message), ''), 'ACS code signed'),
    1,
    ARRAY[]::UUID[]
  )
  ON CONFLICT (recipient_user_id, type, subject_user_id) DO UPDATE SET
    message = (notifications.log_count + 1)::TEXT || ' ACS codes signed by ' || COALESCE(NULLIF(TRIM(p_subject_display_name), ''), 'your mentor'),
    log_count = notifications.log_count + 1,
    updated_at = NOW();
END;
$$;


--
-- Name: create_or_stack_notification(uuid, text, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_or_stack_notification(p_recipient_user_id uuid, p_type text, p_subject_user_id uuid, p_subject_display_name text, p_log_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_existing RECORD;
  v_new_ids UUID[];
  v_new_count INT;
  v_message TEXT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(NULLIF(TRIM(p_subject_display_name), ''), 'Unknown');

  SELECT id, log_count, log_entry_ids INTO v_existing
  FROM public.notifications
  WHERE recipient_user_id = p_recipient_user_id
    AND type = p_type
    AND subject_user_id = p_subject_user_id
  LIMIT 1;

  IF FOUND THEN
    v_new_ids := COALESCE(v_existing.log_entry_ids, ARRAY[]::UUID[]) || p_log_entry_id;
    v_new_count := array_length(v_new_ids, 1);
  ELSE
    v_new_ids := ARRAY[p_log_entry_id];
    v_new_count := 1;
  END IF;

  v_message := CASE p_type
    WHEN 'logs_awaiting' THEN
      CASE WHEN v_new_count = 1 THEN 'Log awaiting approval for ' || v_name
           ELSE v_new_count::TEXT || ' logs awaiting approval for ' || v_name END
    WHEN 'logs_approved' THEN
      CASE WHEN v_new_count = 1 THEN 'Log approved by ' || v_name
           ELSE v_new_count::TEXT || ' logs approved by ' || v_name END
    WHEN 'logs_rejected' THEN
      CASE WHEN v_new_count = 1 THEN 'Log rejected by ' || v_name
           ELSE v_new_count::TEXT || ' logs rejected by ' || v_name END
    ELSE ''
  END;

  IF FOUND THEN
    UPDATE public.notifications
    SET
      log_count = v_new_count,
      log_entry_ids = v_new_ids,
      message = v_message,
      read_at = NULL,  -- New content added = show as unread again
      updated_at = NOW()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.notifications (
      recipient_user_id,
      type,
      subject_user_id,
      message,
      log_count,
      log_entry_ids
    ) VALUES (
      p_recipient_user_id,
      p_type,
      p_subject_user_id,
      v_message,
      v_new_count,
      v_new_ids
    );
  END IF;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
    profile_id UUID;
BEGIN
    -- Extract role from metadata or default to 'apprentice'
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'apprentice');
    
    -- Create profile
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role
    )
    RETURNING id INTO profile_id;
    
    -- Create an apprentice record for ALL users regardless of role
    -- This allows everyone to access apprentice features if needed
    INSERT INTO public.apprentices (user_id, start_date, status)
    VALUES (
        NEW.id,
        CURRENT_DATE,
        'active'
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;


--
-- Name: is_mentor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_mentor() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- This function bypasses RLS because it's SECURITY DEFINER
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'mentor'
    );
END;
$$;


--
-- Name: notify_on_logbook_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_on_logbook_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mentor_id UUID;
  v_apprentice_user_id UUID;
  v_subject_name TEXT;
  v_recipient_id UUID;
  v_subject_id UUID;
BEGIN
  -- Get apprentice's mentor and user_id
  SELECT a.mentor_id, a.user_id INTO v_mentor_id, v_apprentice_user_id
  FROM public.apprentices a
  WHERE a.id = NEW.apprentice_id;

  IF v_mentor_id IS NULL AND v_apprentice_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Status changed to 'submitted' -> notify mentor
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'submitted'))) AND v_mentor_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Apprentice') INTO v_subject_name
    FROM public.profiles p WHERE p.id = v_apprentice_user_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_mentor_id,
      'logs_awaiting',
      v_apprentice_user_id,
      COALESCE(v_subject_name, 'Apprentice'),
      NEW.id
    );
  END IF;

  -- Status changed to 'approved' -> notify apprentice
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'approved'))) AND v_apprentice_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Mentor') INTO v_subject_name
    FROM public.profiles p WHERE p.id = NEW.approved_by LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_apprentice_user_id,
      'logs_approved',
      NEW.approved_by,
      COALESCE(v_subject_name, 'Mentor'),
      NEW.id
    );
  END IF;

  -- Status changed to 'rejected' -> notify apprentice (mentor is the one who rejected)
  IF NEW.status = 'rejected' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'rejected'))) AND v_apprentice_user_id IS NOT NULL AND v_mentor_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Mentor') INTO v_subject_name
    FROM public.profiles p WHERE p.id = v_mentor_id LIMIT 1;
    PERFORM public.create_or_stack_notification(
      v_apprentice_user_id,
      'logs_rejected',
      v_mentor_id,
      COALESCE(v_subject_name, 'Mentor'),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acs_code; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acs_code (
    id integer NOT NULL,
    code text NOT NULL,
    description text,
    domain text NOT NULL,
    subject_letter character(1) NOT NULL,
    subject text NOT NULL,
    category text NOT NULL,
    ata_chapters integer[] DEFAULT '{}'::integer[],
    CONSTRAINT acs_code_category_check CHECK ((category = ANY (ARRAY['knowledge'::text, 'risk_management'::text, 'skill'::text]))),
    CONSTRAINT acs_code_domain_check CHECK ((domain = ANY (ARRAY['general'::text, 'airframe'::text, 'powerplant'::text]))),
    CONSTRAINT acs_code_subject_letter_check CHECK ((subject_letter ~ '^[A-Z]$'::text))
);


--
-- Name: acs_code_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acs_code_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acs_code_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acs_code_id_seq OWNED BY public.acs_code.id;


--
-- Name: acs_signoff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acs_signoff (
    id integer NOT NULL,
    acs_code_id integer NOT NULL,
    apprentice_user_id uuid NOT NULL,
    signer_id uuid NOT NULL,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: acs_signoff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acs_signoff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acs_signoff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acs_signoff_id_seq OWNED BY public.acs_signoff.id;


--
-- Name: apprentice_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apprentice_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    apprentice_id uuid NOT NULL,
    curriculum_item_id uuid NOT NULL,
    status text DEFAULT 'not_started'::text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    hours_spent numeric(10,2) DEFAULT 0,
    mentor_notes text,
    apprentice_notes text,
    rating integer,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT apprentice_progress_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT apprentice_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'reviewed'::text])))
);


--
-- Name: apprentices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apprentices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mentor_id uuid,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    training_plan_id uuid,
    CONSTRAINT apprentices_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'inactive'::text])))
);


--
-- Name: ata_chapter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ata_chapter (
    id integer NOT NULL,
    chapter_number text NOT NULL,
    title text NOT NULL,
    description text
);


--
-- Name: ata_chapter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ata_chapter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ata_chapter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ata_chapter_id_seq OWNED BY public.ata_chapter.id;


--
-- Name: curriculum_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    difficulty_level integer DEFAULT 1,
    estimated_hours numeric(10,2),
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT curriculum_items_difficulty_level_check CHECK (((difficulty_level >= 1) AND (difficulty_level <= 5)))
);


--
-- Name: logbook_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logbook_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    apprentice_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    hours_worked numeric(10,2) DEFAULT 0,
    description text NOT NULL,
    skills_practiced text[],
    challenges_encountered text,
    next_steps text,
    approved_by uuid,
    approved_at timestamp with time zone,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reject_reason text,
    CONSTRAINT logbook_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: logbook_entry_acs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logbook_entry_acs (
    id integer NOT NULL,
    logbook_entry_id uuid NOT NULL,
    acs_code_id integer NOT NULL
);


--
-- Name: logbook_entry_acs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.logbook_entry_acs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: logbook_entry_acs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.logbook_entry_acs_id_seq OWNED BY public.logbook_entry_acs.id;


--
-- Name: logbook_entry_acs_pending; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logbook_entry_acs_pending (
    id integer NOT NULL,
    logbook_entry_id uuid NOT NULL,
    acs_code_id integer NOT NULL
);


--
-- Name: logbook_entry_acs_pending_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.logbook_entry_acs_pending_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: logbook_entry_acs_pending_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.logbook_entry_acs_pending_id_seq OWNED BY public.logbook_entry_acs_pending.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid NOT NULL,
    type text NOT NULL,
    subject_user_id uuid NOT NULL,
    message text NOT NULL,
    log_count integer DEFAULT 1 NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    log_entry_ids uuid[] DEFAULT '{}'::uuid[],
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['logs_awaiting'::text, 'logs_approved'::text, 'logs_rejected'::text, 'acs_signed'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'apprentice'::text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['apprentice'::text, 'mentor'::text, 'manager'::text, 'god'::text])))
);


--
-- Name: training_plan_weeks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_plan_weeks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    training_plan_id uuid NOT NULL,
    week_number integer NOT NULL,
    title text NOT NULL,
    ata_chapter text,
    learning_objectives text[] DEFAULT '{}'::text[] NOT NULL,
    study_materials text,
    practical_application text,
    mentor_discussion_questions text[] DEFAULT '{}'::text[] NOT NULL,
    weekly_deliverable text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    total_weeks integer DEFAULT 130 NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_submission_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_submission_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    file_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    apprentice_id uuid NOT NULL,
    week_number integer NOT NULL,
    curriculum_item_id uuid,
    reflection_text text,
    status text DEFAULT 'draft'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT weekly_submissions_reflection_text_check CHECK ((length(reflection_text) <= 1000)),
    CONSTRAINT weekly_submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: acs_code id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_code ALTER COLUMN id SET DEFAULT nextval('public.acs_code_id_seq'::regclass);


--
-- Name: acs_signoff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_signoff ALTER COLUMN id SET DEFAULT nextval('public.acs_signoff_id_seq'::regclass);


--
-- Name: ata_chapter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ata_chapter ALTER COLUMN id SET DEFAULT nextval('public.ata_chapter_id_seq'::regclass);


--
-- Name: logbook_entry_acs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs ALTER COLUMN id SET DEFAULT nextval('public.logbook_entry_acs_id_seq'::regclass);


--
-- Name: logbook_entry_acs_pending id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs_pending ALTER COLUMN id SET DEFAULT nextval('public.logbook_entry_acs_pending_id_seq'::regclass);


--
-- Name: acs_code acs_code_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_code
    ADD CONSTRAINT acs_code_code_key UNIQUE (code);


--
-- Name: acs_code acs_code_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_code
    ADD CONSTRAINT acs_code_pkey PRIMARY KEY (id);


--
-- Name: acs_signoff acs_signoff_acs_code_id_apprentice_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_signoff
    ADD CONSTRAINT acs_signoff_acs_code_id_apprentice_user_id_key UNIQUE (acs_code_id, apprentice_user_id);


--
-- Name: acs_signoff acs_signoff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_signoff
    ADD CONSTRAINT acs_signoff_pkey PRIMARY KEY (id);


--
-- Name: apprentice_progress apprentice_progress_apprentice_id_curriculum_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentice_progress
    ADD CONSTRAINT apprentice_progress_apprentice_id_curriculum_item_id_key UNIQUE (apprentice_id, curriculum_item_id);


--
-- Name: apprentice_progress apprentice_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentice_progress
    ADD CONSTRAINT apprentice_progress_pkey PRIMARY KEY (id);


--
-- Name: apprentices apprentices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentices
    ADD CONSTRAINT apprentices_pkey PRIMARY KEY (id);


--
-- Name: apprentices apprentices_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentices
    ADD CONSTRAINT apprentices_user_id_key UNIQUE (user_id);


--
-- Name: ata_chapter ata_chapter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ata_chapter
    ADD CONSTRAINT ata_chapter_pkey PRIMARY KEY (id);


--
-- Name: curriculum_items curriculum_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_items
    ADD CONSTRAINT curriculum_items_pkey PRIMARY KEY (id);


--
-- Name: logbook_entries logbook_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entries
    ADD CONSTRAINT logbook_entries_pkey PRIMARY KEY (id);


--
-- Name: logbook_entry_acs logbook_entry_acs_logbook_entry_id_acs_code_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs
    ADD CONSTRAINT logbook_entry_acs_logbook_entry_id_acs_code_id_key UNIQUE (logbook_entry_id, acs_code_id);


--
-- Name: logbook_entry_acs_pending logbook_entry_acs_pending_logbook_entry_id_acs_code_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs_pending
    ADD CONSTRAINT logbook_entry_acs_pending_logbook_entry_id_acs_code_id_key UNIQUE (logbook_entry_id, acs_code_id);


--
-- Name: logbook_entry_acs_pending logbook_entry_acs_pending_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs_pending
    ADD CONSTRAINT logbook_entry_acs_pending_pkey PRIMARY KEY (id);


--
-- Name: logbook_entry_acs logbook_entry_acs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs
    ADD CONSTRAINT logbook_entry_acs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_recipient_user_id_type_subject_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_user_id_type_subject_user_id_key UNIQUE (recipient_user_id, type, subject_user_id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: training_plan_weeks training_plan_weeks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan_weeks
    ADD CONSTRAINT training_plan_weeks_pkey PRIMARY KEY (id);


--
-- Name: training_plan_weeks training_plan_weeks_training_plan_id_week_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan_weeks
    ADD CONSTRAINT training_plan_weeks_training_plan_id_week_number_key UNIQUE (training_plan_id, week_number);


--
-- Name: training_plans training_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_pkey PRIMARY KEY (id);


--
-- Name: weekly_submission_files weekly_submission_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_submission_files
    ADD CONSTRAINT weekly_submission_files_pkey PRIMARY KEY (id);


--
-- Name: weekly_submissions weekly_submissions_apprentice_id_week_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_submissions
    ADD CONSTRAINT weekly_submissions_apprentice_id_week_number_key UNIQUE (apprentice_id, week_number);


--
-- Name: weekly_submissions weekly_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_submissions
    ADD CONSTRAINT weekly_submissions_pkey PRIMARY KEY (id);


--
-- Name: idx_acs_code_ata_chapters; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acs_code_ata_chapters ON public.acs_code USING gin (ata_chapters);


--
-- Name: idx_acs_code_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acs_code_domain ON public.acs_code USING btree (domain);


--
-- Name: idx_acs_signoff_acs_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acs_signoff_acs_code_id ON public.acs_signoff USING btree (acs_code_id);


--
-- Name: idx_acs_signoff_apprentice_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acs_signoff_apprentice_user_id ON public.acs_signoff USING btree (apprentice_user_id);


--
-- Name: idx_acs_signoff_signer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acs_signoff_signer_id ON public.acs_signoff USING btree (signer_id);


--
-- Name: idx_apprentice_progress_apprentice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apprentice_progress_apprentice_id ON public.apprentice_progress USING btree (apprentice_id);


--
-- Name: idx_apprentice_progress_curriculum_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apprentice_progress_curriculum_item_id ON public.apprentice_progress USING btree (curriculum_item_id);


--
-- Name: idx_apprentice_progress_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apprentice_progress_status ON public.apprentice_progress USING btree (status);


--
-- Name: idx_apprentices_mentor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apprentices_mentor_id ON public.apprentices USING btree (mentor_id);


--
-- Name: idx_apprentices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apprentices_status ON public.apprentices USING btree (status);


--
-- Name: idx_apprentices_training_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apprentices_training_plan_id ON public.apprentices USING btree (training_plan_id);


--
-- Name: idx_apprentices_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apprentices_user_id ON public.apprentices USING btree (user_id);


--
-- Name: idx_curriculum_items_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curriculum_items_is_active ON public.curriculum_items USING btree (is_active);


--
-- Name: idx_curriculum_items_order_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curriculum_items_order_index ON public.curriculum_items USING btree (order_index);


--
-- Name: idx_logbook_entries_apprentice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logbook_entries_apprentice_id ON public.logbook_entries USING btree (apprentice_id);


--
-- Name: idx_logbook_entries_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logbook_entries_entry_date ON public.logbook_entries USING btree (entry_date);


--
-- Name: idx_logbook_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logbook_entries_status ON public.logbook_entries USING btree (status);


--
-- Name: idx_logbook_entry_acs_acs_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logbook_entry_acs_acs_code_id ON public.logbook_entry_acs USING btree (acs_code_id);


--
-- Name: idx_logbook_entry_acs_logbook_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logbook_entry_acs_logbook_entry_id ON public.logbook_entry_acs USING btree (logbook_entry_id);


--
-- Name: idx_logbook_entry_acs_pending_acs_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logbook_entry_acs_pending_acs_code_id ON public.logbook_entry_acs_pending USING btree (acs_code_id);


--
-- Name: idx_logbook_entry_acs_pending_logbook_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logbook_entry_acs_pending_logbook_entry_id ON public.logbook_entry_acs_pending USING btree (logbook_entry_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_read_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read_at ON public.notifications USING btree (read_at);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_user_id);


--
-- Name: idx_training_plan_weeks_training_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plan_weeks_training_plan_id ON public.training_plan_weeks USING btree (training_plan_id);


--
-- Name: idx_training_plan_weeks_week_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plan_weeks_week_number ON public.training_plan_weeks USING btree (week_number);


--
-- Name: idx_weekly_submission_files_submission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_submission_files_submission_id ON public.weekly_submission_files USING btree (submission_id);


--
-- Name: idx_weekly_submissions_apprentice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_submissions_apprentice_id ON public.weekly_submissions USING btree (apprentice_id);


--
-- Name: idx_weekly_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_submissions_status ON public.weekly_submissions USING btree (status);


--
-- Name: idx_weekly_submissions_week_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_submissions_week_number ON public.weekly_submissions USING btree (week_number);


--
-- Name: logbook_entries trg_logbook_notify_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_logbook_notify_on_insert AFTER INSERT ON public.logbook_entries FOR EACH ROW EXECUTE FUNCTION public.notify_on_logbook_status_change();


--
-- Name: logbook_entries trg_logbook_notify_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_logbook_notify_on_update AFTER UPDATE ON public.logbook_entries FOR EACH ROW EXECUTE FUNCTION public.notify_on_logbook_status_change();


--
-- Name: apprentice_progress update_apprentice_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_apprentice_progress_updated_at BEFORE UPDATE ON public.apprentice_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: apprentices update_apprentices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_apprentices_updated_at BEFORE UPDATE ON public.apprentices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: curriculum_items update_curriculum_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_curriculum_items_updated_at BEFORE UPDATE ON public.curriculum_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: logbook_entries update_logbook_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_logbook_entries_updated_at BEFORE UPDATE ON public.logbook_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: training_plan_weeks update_training_plan_weeks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_training_plan_weeks_updated_at BEFORE UPDATE ON public.training_plan_weeks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: training_plans update_training_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_training_plans_updated_at BEFORE UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: weekly_submissions update_weekly_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_weekly_submissions_updated_at BEFORE UPDATE ON public.weekly_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: acs_signoff acs_signoff_acs_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_signoff
    ADD CONSTRAINT acs_signoff_acs_code_id_fkey FOREIGN KEY (acs_code_id) REFERENCES public.acs_code(id);


--
-- Name: acs_signoff acs_signoff_apprentice_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_signoff
    ADD CONSTRAINT acs_signoff_apprentice_user_id_fkey FOREIGN KEY (apprentice_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: acs_signoff acs_signoff_signer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acs_signoff
    ADD CONSTRAINT acs_signoff_signer_id_fkey FOREIGN KEY (signer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: apprentice_progress apprentice_progress_apprentice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentice_progress
    ADD CONSTRAINT apprentice_progress_apprentice_id_fkey FOREIGN KEY (apprentice_id) REFERENCES public.apprentices(id) ON DELETE CASCADE;


--
-- Name: apprentice_progress apprentice_progress_curriculum_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentice_progress
    ADD CONSTRAINT apprentice_progress_curriculum_item_id_fkey FOREIGN KEY (curriculum_item_id) REFERENCES public.curriculum_items(id) ON DELETE CASCADE;


--
-- Name: apprentice_progress apprentice_progress_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentice_progress
    ADD CONSTRAINT apprentice_progress_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: apprentices apprentices_mentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentices
    ADD CONSTRAINT apprentices_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: apprentices apprentices_training_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentices
    ADD CONSTRAINT apprentices_training_plan_id_fkey FOREIGN KEY (training_plan_id) REFERENCES public.training_plans(id) ON DELETE SET NULL;


--
-- Name: apprentices apprentices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apprentices
    ADD CONSTRAINT apprentices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: curriculum_items curriculum_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_items
    ADD CONSTRAINT curriculum_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: logbook_entries logbook_entries_apprentice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entries
    ADD CONSTRAINT logbook_entries_apprentice_id_fkey FOREIGN KEY (apprentice_id) REFERENCES public.apprentices(id) ON DELETE CASCADE;


--
-- Name: logbook_entries logbook_entries_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entries
    ADD CONSTRAINT logbook_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: logbook_entry_acs logbook_entry_acs_acs_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs
    ADD CONSTRAINT logbook_entry_acs_acs_code_id_fkey FOREIGN KEY (acs_code_id) REFERENCES public.acs_code(id);


--
-- Name: logbook_entry_acs logbook_entry_acs_logbook_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs
    ADD CONSTRAINT logbook_entry_acs_logbook_entry_id_fkey FOREIGN KEY (logbook_entry_id) REFERENCES public.logbook_entries(id) ON DELETE CASCADE;


--
-- Name: logbook_entry_acs_pending logbook_entry_acs_pending_acs_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs_pending
    ADD CONSTRAINT logbook_entry_acs_pending_acs_code_id_fkey FOREIGN KEY (acs_code_id) REFERENCES public.acs_code(id);


--
-- Name: logbook_entry_acs_pending logbook_entry_acs_pending_logbook_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logbook_entry_acs_pending
    ADD CONSTRAINT logbook_entry_acs_pending_logbook_entry_id_fkey FOREIGN KEY (logbook_entry_id) REFERENCES public.logbook_entries(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_subject_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: training_plan_weeks training_plan_weeks_training_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plan_weeks
    ADD CONSTRAINT training_plan_weeks_training_plan_id_fkey FOREIGN KEY (training_plan_id) REFERENCES public.training_plans(id) ON DELETE CASCADE;


--
-- Name: training_plans training_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weekly_submission_files weekly_submission_files_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_submission_files
    ADD CONSTRAINT weekly_submission_files_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.weekly_submissions(id) ON DELETE CASCADE;


--
-- Name: weekly_submissions weekly_submissions_apprentice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_submissions
    ADD CONSTRAINT weekly_submissions_apprentice_id_fkey FOREIGN KEY (apprentice_id) REFERENCES public.apprentices(id) ON DELETE CASCADE;


--
-- Name: weekly_submissions weekly_submissions_curriculum_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_submissions
    ADD CONSTRAINT weekly_submissions_curriculum_item_id_fkey FOREIGN KEY (curriculum_item_id) REFERENCES public.curriculum_items(id) ON DELETE SET NULL;


--
-- Name: weekly_submissions weekly_submissions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_submissions
    ADD CONSTRAINT weekly_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: logbook_entries Apprentices can manage own logbook entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can manage own logbook entries" ON public.logbook_entries USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = logbook_entries.apprentice_id) AND (apprentices.user_id = auth.uid())))));


--
-- Name: logbook_entry_acs_pending Apprentices can manage own logbook entry ACS pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can manage own logbook entry ACS pending" ON public.logbook_entry_acs_pending USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.apprentices a ON ((a.id = le.apprentice_id)))
  WHERE ((le.id = logbook_entry_acs_pending.logbook_entry_id) AND (a.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.apprentices a ON ((a.id = le.apprentice_id)))
  WHERE ((le.id = logbook_entry_acs_pending.logbook_entry_id) AND (a.user_id = auth.uid())))));


--
-- Name: apprentice_progress Apprentices can manage own progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can manage own progress" ON public.apprentice_progress USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = apprentice_progress.apprentice_id) AND (apprentices.user_id = auth.uid())))));


--
-- Name: weekly_submissions Apprentices can manage own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can manage own submissions" ON public.weekly_submissions USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = weekly_submissions.apprentice_id) AND (apprentices.user_id = auth.uid())))));


--
-- Name: logbook_entry_acs Apprentices can read own logbook entry acs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can read own logbook entry acs" ON public.logbook_entry_acs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.apprentices a ON ((a.id = le.apprentice_id)))
  WHERE ((le.id = logbook_entry_acs.logbook_entry_id) AND (a.user_id = auth.uid())))));


--
-- Name: profiles Apprentices can view mentor profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can view mentor profile" ON public.profiles FOR SELECT USING ((id IN ( SELECT apprentices.mentor_id
   FROM public.apprentices
  WHERE ((apprentices.user_id = auth.uid()) AND (apprentices.mentor_id IS NOT NULL)))));


--
-- Name: apprentices Apprentices can view own record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can view own record" ON public.apprentices FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: weekly_submission_files Apprentices can view own submission files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apprentices can view own submission files" ON public.weekly_submission_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.weekly_submissions ws
     JOIN public.apprentices a ON ((a.id = ws.apprentice_id)))
  WHERE ((ws.id = weekly_submission_files.submission_id) AND (a.user_id = auth.uid())))));


--
-- Name: notifications Authenticated users can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: acs_code Authenticated users can read acs_code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read acs_code" ON public.acs_code FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: acs_signoff Authenticated users can read acs_signoff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read acs_signoff" ON public.acs_signoff FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: ata_chapter Authenticated users can read ata_chapter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read ata_chapter" ON public.ata_chapter FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: curriculum_items Authenticated users can view curriculum items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view curriculum items" ON public.curriculum_items FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: training_plan_weeks Authenticated users can view training plan weeks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view training plan weeks" ON public.training_plan_weeks FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: training_plans Authenticated users can view training plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view training plans" ON public.training_plans FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: profiles Gods can update manager roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gods can update manager roles" ON public.profiles FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = 'god'::text)))) AND (( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = profiles_1.id)) = 'manager'::text)));


--
-- Name: logbook_entries Managers and gods can approve all logbook entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and gods can approve all logbook entries" ON public.logbook_entries FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['manager'::text, 'god'::text]))))));


--
-- Name: apprentice_progress Managers and gods can manage all apprentice progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and gods can manage all apprentice progress" ON public.apprentice_progress USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['manager'::text, 'god'::text]))))));


--
-- Name: weekly_submissions Managers and gods can review all submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and gods can review all submissions" ON public.weekly_submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['manager'::text, 'god'::text]))))));


--
-- Name: apprentices Managers and gods can view all apprentices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and gods can view all apprentices" ON public.apprentices FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['manager'::text, 'god'::text]))))));


--
-- Name: logbook_entries Managers and gods can view all logbook entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and gods can view all logbook entries" ON public.logbook_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['manager'::text, 'god'::text]))))));


--
-- Name: weekly_submission_files Managers and gods can view all submission files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and gods can view all submission files" ON public.weekly_submission_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['manager'::text, 'god'::text]))))));


--
-- Name: weekly_submissions Managers and gods can view all submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and gods can view all submissions" ON public.weekly_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['manager'::text, 'god'::text]))))));


--
-- Name: profiles Managers can update apprentice and mentor roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can update apprentice and mentor roles" ON public.profiles FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = ANY (ARRAY['manager'::text, 'god'::text]))))) AND (( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = profiles_1.id)) = ANY (ARRAY['apprentice'::text, 'mentor'::text]))));


--
-- Name: curriculum_items Mentors and above can manage curriculum items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors and above can manage curriculum items" ON public.curriculum_items USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text]))))));


--
-- Name: training_plan_weeks Mentors and above can manage training plan weeks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors and above can manage training plan weeks" ON public.training_plan_weeks USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text]))))));


--
-- Name: training_plans Mentors and above can manage training plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors and above can manage training plans" ON public.training_plans USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text]))))));


--
-- Name: logbook_entries Mentors can approve logbook entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can approve logbook entries" ON public.logbook_entries FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = logbook_entries.apprentice_id) AND (apprentices.mentor_id = auth.uid())))));


--
-- Name: acs_signoff Mentors can insert acs_signoff for their apprentices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can insert acs_signoff for their apprentices" ON public.acs_signoff FOR INSERT WITH CHECK (((auth.uid() = signer_id) AND (EXISTS ( SELECT 1
   FROM public.apprentices a
  WHERE ((a.user_id = acs_signoff.apprentice_user_id) AND (a.mentor_id = acs_signoff.signer_id))))));


--
-- Name: apprentice_progress Mentors can manage apprentice progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can manage apprentice progress" ON public.apprentice_progress USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = apprentice_progress.apprentice_id) AND (apprentices.mentor_id = auth.uid())))));


--
-- Name: logbook_entry_acs Mentors can read apprentice logbook entry acs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can read apprentice logbook entry acs" ON public.logbook_entry_acs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.apprentices a ON ((a.id = le.apprentice_id)))
  WHERE ((le.id = logbook_entry_acs.logbook_entry_id) AND (a.mentor_id = auth.uid())))));


--
-- Name: weekly_submissions Mentors can review apprentice submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can review apprentice submissions" ON public.weekly_submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = weekly_submissions.apprentice_id) AND (apprentices.mentor_id = auth.uid())))));


--
-- Name: logbook_entries Mentors can view all apprentice logbook entries for assignment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view all apprentice logbook entries for assignment" ON public.logbook_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'mentor'::text)))));


--
-- Name: apprentices Mentors can view all apprentices for assignment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view all apprentices for assignment" ON public.apprentices FOR SELECT USING (public.is_mentor());


--
-- Name: logbook_entries Mentors can view apprentice logbook entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view apprentice logbook entries" ON public.logbook_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = logbook_entries.apprentice_id) AND (apprentices.mentor_id = auth.uid())))));


--
-- Name: logbook_entry_acs_pending Mentors can view apprentice logbook entry ACS pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view apprentice logbook entry ACS pending" ON public.logbook_entry_acs_pending FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.logbook_entries le
     JOIN public.apprentices a ON ((a.id = le.apprentice_id)))
  WHERE ((le.id = logbook_entry_acs_pending.logbook_entry_id) AND (a.mentor_id = auth.uid())))));


--
-- Name: profiles Mentors can view apprentice profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view apprentice profiles" ON public.profiles FOR SELECT USING ((public.is_mentor() AND (role = 'apprentice'::text)));


--
-- Name: weekly_submission_files Mentors can view apprentice submission files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view apprentice submission files" ON public.weekly_submission_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.weekly_submissions ws
     JOIN public.apprentices a ON ((a.id = ws.apprentice_id)))
  WHERE ((ws.id = weekly_submission_files.submission_id) AND (a.mentor_id = auth.uid())))));


--
-- Name: weekly_submissions Mentors can view apprentice submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view apprentice submissions" ON public.weekly_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.apprentices
  WHERE ((apprentices.id = weekly_submissions.apprentice_id) AND (apprentices.mentor_id = auth.uid())))));


--
-- Name: apprentices Mentors can view their apprentices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mentors can view their apprentices" ON public.apprentices FOR SELECT USING ((auth.uid() = mentor_id));


--
-- Name: notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING ((auth.uid() = recipient_user_id));


--
-- Name: notifications Users can update own notifications (mark read); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications (mark read)" ON public.notifications FOR UPDATE USING ((auth.uid() = recipient_user_id)) WITH CHECK ((auth.uid() = recipient_user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = recipient_user_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: acs_code; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acs_code ENABLE ROW LEVEL SECURITY;

--
-- Name: acs_signoff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acs_signoff ENABLE ROW LEVEL SECURITY;

--
-- Name: apprentice_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apprentice_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: ata_chapter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ata_chapter ENABLE ROW LEVEL SECURITY;

--
-- Name: curriculum_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curriculum_items ENABLE ROW LEVEL SECURITY;

--
-- Name: logbook_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logbook_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: logbook_entry_acs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logbook_entry_acs ENABLE ROW LEVEL SECURITY;

--
-- Name: logbook_entry_acs_pending; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logbook_entry_acs_pending ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: training_plan_weeks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_plan_weeks ENABLE ROW LEVEL SECURITY;

--
-- Name: training_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_submission_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_submission_files ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_submissions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

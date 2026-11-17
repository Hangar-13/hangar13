"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAllAcsCodesWithChapters, type AcsCodeWithChapters } from "@/app/actions/acs-codes";
import { createLogbookEntry } from "@/app/actions/logbook";
import type { AcsDomain } from "@/lib/acs-utils";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";
import {
  generateProposedEntriesFromClaims,
  PRIOR_OJT_BACKGROUNDS,
  PRIOR_OJT_EVIDENCE_TYPES,
  type PriorOjtAssessmentStatus,
  type PriorOjtBackground,
  type PriorOjtClaimInput,
  type PriorOjtEvidenceType,
  type PriorOjtProposedEntryStatus,
} from "@/lib/prior-ojt";

export type PriorOjtAssessmentRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  backgrounds: string[];
  summary: string | null;
  selected_domains: AcsDomain[];
  status: PriorOjtAssessmentStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  accepted_at: string | null;
  mechanic_experience_years: number | null;
  mechanic_experience_months: number | null;
};

export type PriorOjtExperienceLineInput = {
  start: string;
  end: string;
  airframes: string[];
  engines: string[];
};

export type PriorOjtExperienceInput = {
  years: number;
  months: number;
  lines: PriorOjtExperienceLineInput[];
};

export type PriorOjtClaimRow = {
  id: string;
  assessment_id: string;
  acs_code_id: number;
  evidence_types: PriorOjtEvidenceType[];
};

export type PriorOjtProposedEntryRow = {
  id: string;
  assessment_id: string;
  entry_date: string;
  hours_worked: number;
  description: string;
  ata_chapter_number: string | null;
  acs_code_ids: number[];
  domain: AcsDomain | null;
  subject_letter: string | null;
  subject: string | null;
  evidence_types: PriorOjtEvidenceType[];
  status: PriorOjtProposedEntryStatus;
  logbook_entry_id: string | null;
  sort_order: number;
};

function isDomain(value: string): value is AcsDomain {
  return value === "general" || value === "airframe" || value === "powerplant";
}

function normalizeBackgrounds(values: string[]): PriorOjtBackground[] {
  const allowed = new Set<string>(PRIOR_OJT_BACKGROUNDS);
  return values.filter((v): v is PriorOjtBackground => allowed.has(v));
}

function normalizeEvidence(values: string[]): PriorOjtEvidenceType[] {
  const allowed = new Set<string>(PRIOR_OJT_EVIDENCE_TYPES);
  return values.filter((v): v is PriorOjtEvidenceType => allowed.has(v));
}

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: "You must be logged in." as const, supabase, user: null };
  }
  return { supabase, user, error: null };
}

async function getOwnedAssessment(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  assessmentId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("prior_ojt_assessments")
    .select("*")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PriorOjtAssessmentRow;
}

export async function getPriorOjtCatalog(): Promise<AcsCodeWithChapters[]> {
  return getAllAcsCodesWithChapters();
}

export async function getActivePriorOjtAssessment(): Promise<{
  assessment: PriorOjtAssessmentRow | null;
  claims: PriorOjtClaimRow[];
  proposedEntries: PriorOjtProposedEntryRow[];
  experienceLines: PriorOjtExperienceLineInput[];
  error?: string;
}> {
  const auth = await requireUser();
  if (auth.error || !auth.user) {
    return {
      assessment: null,
      claims: [],
      proposedEntries: [],
      experienceLines: [],
      error: auth.error,
    };
  }

  const { data: assessment, error } = await auth.supabase
    .from("prior_ojt_assessments")
    .select("*")
    .eq("user_id", auth.user.id)
    .in("status", ["in_progress", "completed", "reviewing"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      assessment: null,
      claims: [],
      proposedEntries: [],
      experienceLines: [],
      error: error.message,
    };
  }

  if (!assessment) {
    return { assessment: null, claims: [], proposedEntries: [], experienceLines: [] };
  }

  const [claimsRes, proposedRes, linesRes] = await Promise.all([
    auth.supabase
      .from("prior_ojt_claims")
      .select("id, assessment_id, acs_code_id, evidence_types")
      .eq("assessment_id", assessment.id),
    auth.supabase
      .from("prior_ojt_proposed_entries")
      .select("*")
      .eq("assessment_id", assessment.id)
      .order("sort_order", { ascending: true }),
    auth.supabase
      .from("prior_ojt_experience_lines")
      .select("start_year, start_month, end_year, end_month, airframes, engines, sort_order")
      .eq("assessment_id", assessment.id)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    assessment: assessment as PriorOjtAssessmentRow,
    claims: (claimsRes.data ?? []).map((row) => ({
      id: row.id as string,
      assessment_id: row.assessment_id as string,
      acs_code_id: row.acs_code_id as number,
      evidence_types: normalizeEvidence((row.evidence_types as string[]) ?? []),
    })),
    proposedEntries: (proposedRes.data ?? []).map(mapProposedEntry),
    experienceLines: (linesRes.data ?? []).map((row) =>
      mapExperienceLine(row as Record<string, unknown>)
    ),
  };
}

function monthValue(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 1940 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function cleanLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const label = value.trim();
    if (!label || label.length > 200) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function validateExperience(input: PriorOjtExperienceInput):
  | { error: string }
  | {
      years: number;
      months: number;
      lines: Array<{
        start_year: number;
        start_month: number;
        end_year: number;
        end_month: number;
        airframes: string[];
        engines: string[];
      }>;
    } {
  if (!Number.isInteger(input.years) || input.years < 0 || input.years > 80) {
    return { error: "Enter total years as a whole number from 0 to 80." };
  }
  if (!Number.isInteger(input.months) || input.months < 0 || input.months > 11) {
    return { error: "Enter leftover months as a whole number from 0 to 11." };
  }
  const lines = [];
  for (const [index, line] of input.lines.entries()) {
    const start = monthValue(line.start);
    const end = monthValue(line.end);
    if (!start || !end) {
      return { error: `Line ${index + 1} needs a month and year for both From and To.` };
    }
    if (end.year * 12 + end.month < start.year * 12 + start.month) {
      return { error: `Line ${index + 1} ends before it starts.` };
    }
    const airframes = cleanLabels(line.airframes);
    const engines = cleanLabels(line.engines);
    if (airframes.length + engines.length === 0) {
      return { error: `Line ${index + 1} needs at least one airframe or engine.` };
    }
    lines.push({
      start_year: start.year,
      start_month: start.month,
      end_year: end.year,
      end_month: end.month,
      airframes,
      engines,
    });
  }
  return { years: input.years, months: input.months, lines };
}

async function saveExperience(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  assessmentId: string,
  input: PriorOjtExperienceInput
): Promise<{ error?: string }> {
  const parsed = validateExperience(input);
  if ("error" in parsed) return { error: parsed.error };

  const { error: updateError } = await supabase
    .from("prior_ojt_assessments")
    .update({
      mechanic_experience_years: parsed.years,
      mechanic_experience_months: parsed.months,
    })
    .eq("id", assessmentId);
  if (updateError) return { error: updateError.message };

  const { error: deleteError } = await supabase
    .from("prior_ojt_experience_lines")
    .delete()
    .eq("assessment_id", assessmentId);
  if (deleteError) return { error: deleteError.message };

  if (parsed.lines.length > 0) {
    const { error: insertError } = await supabase.from("prior_ojt_experience_lines").insert(
      parsed.lines.map((line, index) => ({
        assessment_id: assessmentId,
        sort_order: index,
        ...line,
      }))
    );
    if (insertError) return { error: insertError.message };
  }

  for (const line of parsed.lines) {
    for (const label of line.airframes) {
      await supabase.rpc("ensure_logbook_equipment_catalog_label", {
        p_kind: "aircraft",
        p_label: label,
      });
    }
    for (const label of line.engines) {
      await supabase.rpc("ensure_logbook_equipment_catalog_label", {
        p_kind: "engine",
        p_label: label,
      });
    }
  }

  return {};
}

function mapExperienceLine(row: Record<string, unknown>): PriorOjtExperienceLineInput {
  const month = (year: number, value: number) =>
    `${year}-${String(value).padStart(2, "0")}`;
  return {
    start: month(Number(row.start_year), Number(row.start_month)),
    end: month(Number(row.end_year), Number(row.end_month)),
    airframes: Array.isArray(row.airframes) ? row.airframes.map(String) : [],
    engines: Array.isArray(row.engines) ? row.engines.map(String) : [],
  };
}

function mapProposedEntry(row: Record<string, unknown>): PriorOjtProposedEntryRow {
  const domain = typeof row.domain === "string" && isDomain(row.domain) ? row.domain : null;
  return {
    id: String(row.id),
    assessment_id: String(row.assessment_id),
    entry_date: String(row.entry_date),
    hours_worked: Number(row.hours_worked ?? 0),
    description: String(row.description ?? ""),
    ata_chapter_number:
      row.ata_chapter_number == null ? null : String(row.ata_chapter_number),
    acs_code_ids: Array.isArray(row.acs_code_ids)
      ? (row.acs_code_ids as number[])
      : [],
    domain,
    subject_letter: row.subject_letter == null ? null : String(row.subject_letter),
    subject: row.subject == null ? null : String(row.subject),
    evidence_types: normalizeEvidence((row.evidence_types as string[]) ?? []),
    status: row.status as PriorOjtProposedEntryStatus,
    logbook_entry_id:
      row.logbook_entry_id == null ? null : String(row.logbook_entry_id),
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function startPriorOjtAssessment(input: {
  fullName: string;
  email: string;
  backgrounds: string[];
  summary?: string;
  experience: PriorOjtExperienceInput;
}): Promise<{ assessmentId?: string; error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const fullName = input.fullName.trim();
  const email = input.email.trim();
  if (!fullName) return { error: "Full name is required." };
  if (!email) return { error: "Email is required." };
  const experience = validateExperience(input.experience);
  if ("error" in experience) return { error: experience.error };

  const { data, error } = await auth.supabase
    .from("prior_ojt_assessments")
    .insert({
      user_id: auth.user.id,
      full_name: fullName,
      email,
      backgrounds: normalizeBackgrounds(input.backgrounds),
      summary: input.summary?.trim() || null,
      selected_domains: [],
      status: "in_progress",
      mechanic_experience_years: experience.years,
      mechanic_experience_months: experience.months,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to start assessment." };
  }

  const saved = await saveExperience(auth.supabase, data.id as string, input.experience);
  if (saved.error) return { error: saved.error };

  return { assessmentId: data.id as string };
}

export async function updatePriorOjtIntro(
  assessmentId: string,
  input: {
    fullName: string;
    email: string;
    backgrounds: string[];
    summary?: string;
    experience: PriorOjtExperienceInput;
  }
): Promise<{ error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const owned = await getOwnedAssessment(auth.supabase, assessmentId, auth.user.id);
  if (!owned) return { error: "Assessment not found." };
  if (owned.status === "accepted") return { error: "Assessment already accepted." };

  const { error } = await auth.supabase
    .from("prior_ojt_assessments")
    .update({
      full_name: input.fullName.trim(),
      email: input.email.trim(),
      backgrounds: normalizeBackgrounds(input.backgrounds),
      summary: input.summary?.trim() || null,
    })
    .eq("id", assessmentId);
  if (error) return { error: error.message };

  return saveExperience(auth.supabase, assessmentId, input.experience);
}

export async function updatePriorOjtSelectedDomains(
  assessmentId: string,
  domains: string[]
): Promise<{ error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const owned = await getOwnedAssessment(auth.supabase, assessmentId, auth.user.id);
  if (!owned) return { error: "Assessment not found." };
  if (owned.status === "accepted") return { error: "Assessment already accepted." };

  const selected = [...new Set(domains.filter(isDomain))];
  if (selected.length === 0) {
    return { error: "Select at least one section." };
  }

  const { error } = await auth.supabase
    .from("prior_ojt_assessments")
    .update({ selected_domains: selected })
    .eq("id", assessmentId);

  return error ? { error: error.message } : {};
}

export async function savePriorOjtClaims(
  assessmentId: string,
  claims: PriorOjtClaimInput[]
): Promise<{ error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const owned = await getOwnedAssessment(auth.supabase, assessmentId, auth.user.id);
  if (!owned) return { error: "Assessment not found." };
  if (owned.status === "accepted") return { error: "Assessment already accepted." };

  const cleaned = claims
    .map((c) => ({
      acsCodeId: c.acsCodeId,
      evidenceTypes: normalizeEvidence(c.evidenceTypes),
    }))
    .filter((c) => c.evidenceTypes.length > 0);

  const { error: deleteError } = await auth.supabase
    .from("prior_ojt_claims")
    .delete()
    .eq("assessment_id", assessmentId);

  if (deleteError) return { error: deleteError.message };

  if (cleaned.length === 0) return {};

  const { error: insertError } = await auth.supabase.from("prior_ojt_claims").insert(
    cleaned.map((c) => ({
      assessment_id: assessmentId,
      acs_code_id: c.acsCodeId,
      evidence_types: c.evidenceTypes,
    }))
  );

  return insertError ? { error: insertError.message } : {};
}

export async function completePriorOjtAssessmentAndGenerateEntries(
  assessmentId: string,
  claims: PriorOjtClaimInput[],
  options?: { claimChapters?: Record<number, string> }
): Promise<{ proposedEntries?: PriorOjtProposedEntryRow[]; error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const owned = await getOwnedAssessment(auth.supabase, assessmentId, auth.user.id);
  if (!owned) return { error: "Assessment not found." };
  if (owned.status === "accepted") return { error: "Assessment already accepted." };

  const saveResult = await savePriorOjtClaims(assessmentId, claims);
  if (saveResult.error) return { error: saveResult.error };

  const catalog = await getAllAcsCodesWithChapters();
  const codesById = new Map(catalog.map((c) => [c.id, c]));
  const ataChapterTitles = new Map<string, string>();
  for (const code of catalog) {
    for (const n of code.ata_chapter_numbers) {
      if (!ataChapterTitles.has(n)) ataChapterTitles.set(n, n);
    }
  }
  const { data: ataRows } = await auth.supabase
    .from("ata_chapter")
    .select("chapter_number, title");
  for (const row of ataRows ?? []) {
    const n = String(row.chapter_number ?? "").trim();
    const normalized = n.length === 1 && /^\d$/.test(n) ? `0${n}` : n;
    ataChapterTitles.set(normalized, String(row.title ?? normalized));
  }

  const generated = generateProposedEntriesFromClaims({
    claims: claims
      .map((c) => ({
        acsCodeId: c.acsCodeId,
        evidenceTypes: normalizeEvidence(c.evidenceTypes),
      }))
      .filter((c) => c.evidenceTypes.length > 0),
    codesById,
    claimChapters: options?.claimChapters,
    ataChapterTitles,
  });

  const { error: clearError } = await auth.supabase
    .from("prior_ojt_proposed_entries")
    .delete()
    .eq("assessment_id", assessmentId);

  if (clearError) return { error: clearError.message };

  if (generated.length > 0) {
    const { error: insertError } = await auth.supabase
      .from("prior_ojt_proposed_entries")
      .insert(
        generated.map((row) => ({
          assessment_id: assessmentId,
          entry_date: row.entryDate,
          hours_worked: row.hoursWorked,
          description: row.description,
          ata_chapter_number: row.ataChapterNumber,
          acs_code_ids: row.acsCodeIds,
          domain: row.domain,
          subject_letter: row.subjectLetter,
          subject: row.subject,
          evidence_types: row.evidenceTypes,
          status: "pending",
          sort_order: row.sortOrder,
        }))
      );
    if (insertError) return { error: insertError.message };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = generated.length === 0 ? "accepted" : "reviewing";
  const { error: statusError } = await auth.supabase
    .from("prior_ojt_assessments")
    .update({
      status: nextStatus,
      completed_at: owned.completed_at ?? nowIso,
      ...(nextStatus === "accepted" ? { accepted_at: nowIso } : {}),
    })
    .eq("id", assessmentId);

  if (statusError) return { error: statusError.message };

  const { data: proposed, error: loadError } = await auth.supabase
    .from("prior_ojt_proposed_entries")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("sort_order", { ascending: true });

  if (loadError) return { error: loadError.message };

  revalidatePath("/dashboard/student/prior-ojt");
  return { proposedEntries: (proposed ?? []).map(mapProposedEntry) };
}

export async function updatePriorOjtProposedEntry(
  entryId: string,
  patch: {
    entryDate?: string;
    hoursWorked?: number;
    description?: string;
    ataChapterNumber?: string | null;
    status?: Extract<PriorOjtProposedEntryStatus, "pending" | "removed">;
  }
): Promise<{ error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const { data: entry, error: loadError } = await auth.supabase
    .from("prior_ojt_proposed_entries")
    .select("id, assessment_id, status")
    .eq("id", entryId)
    .maybeSingle();

  if (loadError || !entry) return { error: "Proposed entry not found." };

  const owned = await getOwnedAssessment(
    auth.supabase,
    entry.assessment_id as string,
    auth.user.id
  );
  if (!owned) return { error: "Assessment not found." };
  if (owned.status === "accepted") return { error: "Assessment already accepted." };
  if (entry.status === "accepted") {
    return { error: "This entry was already accepted into the logbook." };
  }

  const update: Record<string, unknown> = {};
  if (patch.entryDate !== undefined) update.entry_date = patch.entryDate;
  if (patch.hoursWorked !== undefined) {
    if (
      !Number.isFinite(patch.hoursWorked) ||
      patch.hoursWorked < 0 ||
      patch.hoursWorked > 9999.99
    ) {
      return { error: "Hours must be between 0 and 9999.99." };
    }
    update.hours_worked = Math.round(patch.hoursWorked * 100) / 100;
  }
  if (patch.description !== undefined) {
    const desc = patch.description.trim();
    if (!desc) return { error: "Description is required." };
    update.description = desc;
  }
  if (patch.ataChapterNumber !== undefined) {
    update.ata_chapter_number = patch.ataChapterNumber?.trim() || null;
  }
  if (patch.status !== undefined) update.status = patch.status;

  const { error } = await auth.supabase
    .from("prior_ojt_proposed_entries")
    .update(update)
    .eq("id", entryId);

  return error ? { error: error.message } : {};
}

async function acceptOneProposedEntry(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  entry: PriorOjtProposedEntryRow
): Promise<{ logbookEntryId?: string; error?: string }> {
  if (entry.status === "accepted" && entry.logbook_entry_id) {
    return { logbookEntryId: entry.logbook_entry_id };
  }
  if (entry.status === "removed") {
    return { error: "Removed entries cannot be accepted." };
  }
  if (!entry.ata_chapter_number) {
    return {
      error: `Choose an ATA chapter for “${entry.subject ?? "this entry"}” before accepting.`,
    };
  }

  const result = await createLogbookEntry({
    entryDate: entry.entry_date,
    startTime: "08:00",
    endTime: "09:00",
    hoursWorked: entry.hours_worked,
    source: "prior_exp",
    taskDescription: entry.description,
    ataChapter: entry.ata_chapter_number,
    certified: false,
    selectedAcsCodeIds: entry.acs_code_ids,
  });

  if ("error" in result && result.error) {
    return { error: result.error };
  }

  const logbookEntryId = (result as { data?: { id?: string } }).data?.id;
  if (!logbookEntryId) {
    return { error: "Failed to create logbook entry." };
  }

  const { error } = await supabase
    .from("prior_ojt_proposed_entries")
    .update({
      status: "accepted",
      logbook_entry_id: logbookEntryId,
    })
    .eq("id", entry.id);

  if (error) return { error: error.message };
  return { logbookEntryId };
}

export async function acceptPriorOjtProposedEntry(
  entryId: string
): Promise<{ logbookEntryId?: string; error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const { data: row, error: loadError } = await auth.supabase
    .from("prior_ojt_proposed_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();

  if (loadError || !row) return { error: "Proposed entry not found." };

  const owned = await getOwnedAssessment(
    auth.supabase,
    row.assessment_id as string,
    auth.user.id
  );
  if (!owned) return { error: "Assessment not found." };

  const result = await acceptOneProposedEntry(auth.supabase, mapProposedEntry(row));
  if (result.error) return result;

  await maybeMarkAssessmentAccepted(auth.supabase, owned.id);

  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/prior-ojt");
  revalidatePath("/dashboard/student/logbook");
  revalidatePath("/dashboard/student/skills");
  return result;
}

export async function acceptAllPriorOjtProposedEntries(
  assessmentId: string
): Promise<{ acceptedCount?: number; error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const owned = await getOwnedAssessment(auth.supabase, assessmentId, auth.user.id);
  if (!owned) return { error: "Assessment not found." };

  const { data: rows, error } = await auth.supabase
    .from("prior_ojt_proposed_entries")
    .select("*")
    .eq("assessment_id", assessmentId)
    .eq("status", "pending")
    .order("sort_order", { ascending: true });

  if (error) return { error: error.message };

  let acceptedCount = 0;
  for (const row of rows ?? []) {
    const result = await acceptOneProposedEntry(auth.supabase, mapProposedEntry(row));
    if (result.error) {
      return {
        error: result.error,
        acceptedCount,
      };
    }
    acceptedCount += 1;
  }

  await maybeMarkAssessmentAccepted(auth.supabase, assessmentId);

  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/prior-ojt");
  revalidatePath("/dashboard/student/logbook");
  revalidatePath("/dashboard/student/skills");
  return { acceptedCount };
}

async function maybeMarkAssessmentAccepted(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  assessmentId: string
) {
  const { data: remaining } = await supabase
    .from("prior_ojt_proposed_entries")
    .select("id")
    .eq("assessment_id", assessmentId)
    .eq("status", "pending")
    .limit(1);

  if ((remaining ?? []).length > 0) return;

  await supabase
    .from("prior_ojt_assessments")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", assessmentId);
}

export async function abandonPriorOjtAssessment(
  assessmentId: string
): Promise<{ error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const owned = await getOwnedAssessment(auth.supabase, assessmentId, auth.user.id);
  if (!owned) return { error: "Assessment not found." };
  if (owned.status === "accepted") {
    return { error: "Accepted assessments cannot be abandoned." };
  }

  const { error } = await auth.supabase
    .from("prior_ojt_assessments")
    .delete()
    .eq("id", assessmentId);

  return error ? { error: error.message } : {};
}

export type PriorOjtDashboardProgress = {
  showSection: boolean;
  status: PriorOjtAssessmentStatus | "not_started" | "skipped";
  claimedCount: number;
  pendingEntryCount: number;
  selectedDomainCount: number;
  progressLabel: string;
};

/** Dashboard onboarding state for the Prior OJT section. */
export async function getPriorOjtDashboardProgress(): Promise<
  PriorOjtDashboardProgress | { error: string }
> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error ?? "Not authenticated." };

  const profile = await fetchSessionUserProfile(auth.supabase);

  if (profile?.prior_ojt_skipped_at) {
    return {
      showSection: false,
      status: "skipped",
      claimedCount: 0,
      pendingEntryCount: 0,
      selectedDomainCount: 0,
      progressLabel: "",
    };
  }

  const { data: accepted } = await auth.supabase
    .from("prior_ojt_assessments")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();

  if (accepted) {
    return {
      showSection: false,
      status: "accepted",
      claimedCount: 0,
      pendingEntryCount: 0,
      selectedDomainCount: 0,
      progressLabel: "",
    };
  }

  const active = await getActivePriorOjtAssessment();
  if (active.error) return { error: active.error };

  if (!active.assessment) {
    return {
      showSection: true,
      status: "not_started",
      claimedCount: 0,
      pendingEntryCount: 0,
      selectedDomainCount: 0,
      progressLabel: "Not started — walk through ACS subjects you already know.",
    };
  }

  const claimedCount = active.claims.length;
  const pendingEntryCount = active.proposedEntries.filter(
    (e) => e.status === "pending"
  ).length;
  const selectedDomainCount = active.assessment.selected_domains?.length ?? 0;

  if (active.assessment.status === "reviewing") {
    return {
      showSection: true,
      status: "reviewing",
      claimedCount,
      pendingEntryCount,
      selectedDomainCount,
      progressLabel:
        pendingEntryCount > 0
          ? `Almost done — ${pendingEntryCount} draft log ${
              pendingEntryCount === 1 ? "entry" : "entries"
            } ready to review.`
          : "Assessment complete — finish reviewing your draft log entries.",
    };
  }

  return {
    showSection: true,
    status: active.assessment.status,
    claimedCount,
    pendingEntryCount,
    selectedDomainCount,
    progressLabel:
      claimedCount > 0
        ? `In progress — ${claimedCount} ACS ${
            claimedCount === 1 ? "code" : "codes"
          } claimed${
            selectedDomainCount > 0
              ? ` across ${selectedDomainCount} section${
                  selectedDomainCount === 1 ? "" : "s"
                }`
              : ""
          }.`
        : selectedDomainCount > 0
          ? `In progress — ${selectedDomainCount} section${
              selectedDomainCount === 1 ? "" : "s"
            } selected. Continue where you left off.`
          : "In progress — continue your Prior OJT assessment.",
  };
}

export async function skipPriorOjtExperience(): Promise<{ error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error };

  const { error } = await auth.supabase
    .from("users")
    .update({ prior_ojt_skipped_at: new Date().toISOString() })
    .eq("id", auth.user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/student");
  return {};
}

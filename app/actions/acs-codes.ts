"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { AtaChapter } from "@/app/actions/ata-chapters";
import {
  normalizeChapterNumber,
  getDomainForAtaChapter,
  type AcsDomain,
} from "@/lib/acs-utils";

export type AcsCategory = "knowledge" | "risk_management" | "skill";

export type AcsCode = {
  id: number;
  code: string;
  domain: AcsDomain;
  subject_letter: string;
  subject: string;
  category: AcsCategory;
  description: string;
  ata_chapters: number[];
};

/** AcsCode with resolved chapter numbers for display (e.g. ["20", "24"]) */
export type AcsCodeWithChapters = AcsCode & { ata_chapter_numbers: string[] };

/** Get a single ACS code by ID. Returns null if not found. */
export async function getAcsCodeById(id: number): Promise<AcsCode | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("acs_code")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as number,
    code: row.code as string,
    domain: row.domain as AcsDomain,
    subject_letter: String(row.subject_letter ?? ""),
    subject: String(row.subject ?? ""),
    category: row.category as AcsCategory,
    description: String(row.description ?? ""),
    ata_chapters: (row.ata_chapters as number[]) ?? [],
  };
}

/** Get ATA chapters for an ACS code (resolves ata_chapters IDs to full chapter info). */
export async function getAtaChaptersForAcsCode(acsCodeId: number): Promise<AtaChapter[]> {
  const supabase = await createServerSupabaseClient();
  const { data: acsCode, error: acsError } = await supabase
    .from("acs_code")
    .select("ata_chapters")
    .eq("id", acsCodeId)
    .maybeSingle();

  if (acsError || !acsCode?.ata_chapters?.length) return [];
  const ids = acsCode.ata_chapters as number[];
  if (ids.length === 0) return [];

  const { data: chapters, error: chError } = await supabase
    .from("ata_chapter")
    .select("id, chapter_number, title, description")
    .in("id", ids)
    .order("chapter_number", { ascending: true });

  if (chError || !chapters?.length) return [];
  return chapters.map((c) => ({
    ...c,
    chapter_number: normalizeChapterNumber(c.chapter_number),
  })) as AtaChapter[];
}

/** Get ACS codes by domain (general | airframe | powerplant) */
export async function getAcsCodesByDomain(domain: AcsDomain): Promise<AcsCode[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("acs_code")
    .select("*")
    .eq("domain", domain)
    .order("code", { ascending: true });

  if (error) {
    console.error("Error fetching ACS codes:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    code: row.code as string,
    domain: row.domain as AcsDomain,
    subject_letter: String(row.subject_letter ?? ""),
    subject: String(row.subject ?? ""),
    category: row.category as AcsCategory,
    description: String(row.description ?? ""),
    ata_chapters: (row.ata_chapters as number[]) ?? [],
  }));
}

/** Get ACS codes for an ATA chapter by chapter number (e.g. "20", "09"). Returns codes with resolved ata_chapter_numbers for display. */
export async function getAcsCodesByChapter(chapterNumber: string): Promise<AcsCodeWithChapters[]> {
  const supabase = await createServerSupabaseClient();
  const normalizedChapter = normalizeChapterNumber(chapterNumber);

  const { data: ataChapter, error: chapterError } = await supabase
    .from("ata_chapter")
    .select("id")
    .eq("chapter_number", normalizedChapter)
    .maybeSingle();

  if (chapterError || !ataChapter) {
    const domain = getDomainForAtaChapter(chapterNumber);
    const codes = await getAcsCodesByDomain(domain);
    return enrichWithChapterNumbers(supabase, codes);
  }

  const { data, error } = await supabase
    .from("acs_code")
    .select("*")
    .contains("ata_chapters", [ataChapter.id])
    .order("code", { ascending: true });

  if (error) {
    console.error("Error fetching ACS codes:", error);
    const domain = getDomainForAtaChapter(chapterNumber);
    const codes = await getAcsCodesByDomain(domain);
    return enrichWithChapterNumbers(supabase, codes);
  }

  if (!data?.length) {
    const domain = getDomainForAtaChapter(chapterNumber);
    const codes = await getAcsCodesByDomain(domain);
    return enrichWithChapterNumbers(supabase, codes);
  }

  const codes = data.map((row: Record<string, unknown>) => ({
    id: row.id as number,
    code: row.code as string,
    domain: row.domain as AcsDomain,
    subject_letter: String(row.subject_letter ?? ""),
    subject: String(row.subject ?? ""),
    category: row.category as AcsCategory,
    description: String(row.description ?? ""),
    ata_chapters: (row.ata_chapters as number[]) ?? [],
  }));
  return enrichWithChapterNumbers(supabase, codes);
}

async function enrichWithChapterNumbers(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  codes: AcsCode[]
): Promise<AcsCodeWithChapters[]> {
  const allIds = [...new Set(codes.flatMap((c) => c.ata_chapters))];
  if (allIds.length === 0) return codes.map((c) => ({ ...c, ata_chapter_numbers: [] }));
  const { data: chapters } = await supabase
    .from("ata_chapter")
    .select("id, chapter_number")
    .in("id", allIds);
  const idToNum = Object.fromEntries(
    (chapters ?? []).map((c) => [String(c.id), normalizeChapterNumber(c.chapter_number)])
  );
  return codes.map((c) => ({
    ...c,
    ata_chapter_numbers: c.ata_chapters
      .map((id) => idToNum[String(id)])
      .filter((n): n is string => n != null),
  }));
}

/** All ACS codes in the catalog with resolved ATA chapter numbers for display. */
export async function getAllAcsCodesWithChapters(): Promise<AcsCodeWithChapters[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("acs_code")
    .select("*")
    .order("code", { ascending: true });

  if (error) {
    console.error("Error fetching all ACS codes:", error);
    return [];
  }

  const codes = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    code: row.code as string,
    domain: row.domain as AcsDomain,
    subject_letter: String(row.subject_letter ?? ""),
    subject: String(row.subject ?? ""),
    category: row.category as AcsCategory,
    description: String(row.description ?? ""),
    ata_chapters: (row.ata_chapters as number[]) ?? [],
  }));
  return enrichWithChapterNumbers(supabase, codes);
}

/** Get ACS codes for an ATA chapter by ata_chapter.id (alternative to getAcsCodesByChapter when you have the ID). */
export async function getAcsCodesByAtaChapterId(ataChapterId: number): Promise<AcsCode[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("acs_code")
    .select("*")
    .contains("ata_chapters", [ataChapterId])
    .order("code", { ascending: true });

  if (error) {
    console.error("Error fetching ACS codes by ata_chapter id:", error);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    code: row.code as string,
    domain: row.domain as AcsDomain,
    subject_letter: String(row.subject_letter ?? ""),
    subject: String(row.subject ?? ""),
    category: row.category as AcsCategory,
    description: String(row.description ?? ""),
    ata_chapters: (row.ata_chapters as number[]) ?? [],
  }));
}

/** ACS coverage: satisfied count, total count, and IDs of satisfied codes */
export type AcsCoverage = {
  satisfied: number;
  total: number;
  satisfiedCodeIds: number[];
};

export type AcsCoverageByChapter = Record<string, AcsCoverage>;
export type AcsCoverageByDomain = Record<AcsDomain, AcsCoverage>;

/** Get ACS coverage by domain (general, airframe, powerplant) */
export async function getAcsCoverageByDomain(
  userTrainingId: string
): Promise<AcsCoverageByDomain> {
  const supabase = await createServerSupabaseClient();

  const { data: acsCodes } = await supabase
    .from("acs_code")
    .select("id, domain")
    .order("id");

  const totalByDomain: Record<AcsDomain, number> = {
    general: 0,
    airframe: 0,
    powerplant: 0,
  };
  const acsToDomain: Record<number, AcsDomain> = {};
  (acsCodes ?? []).forEach((ac) => {
    const d = ac.domain as AcsDomain;
    if (d in totalByDomain) {
      totalByDomain[d]++;
      acsToDomain[ac.id] = d;
    }
  });

  const { data: approvedEntries } = await supabase
    .from("logbook_entries")
    .select("id")
    .eq("user_training_id", userTrainingId)
    .eq("status", "approved");

  const approvedIds = (approvedEntries ?? []).map((e) => e.id);
  if (approvedIds.length === 0) {
    return {
      general: { satisfied: 0, total: totalByDomain.general, satisfiedCodeIds: [] },
      airframe: { satisfied: 0, total: totalByDomain.airframe, satisfiedCodeIds: [] },
      powerplant: { satisfied: 0, total: totalByDomain.powerplant, satisfiedCodeIds: [] },
    };
  }

  const { data: approvedAcs } = await supabase
    .from("logbook_entry_acs")
    .select("logbook_entry_id, acs_code_id")
    .in("logbook_entry_id", approvedIds);

  const satisfiedCodeIds = new Set<number>();
  (approvedAcs ?? []).forEach((row) => satisfiedCodeIds.add(row.acs_code_id));

  const satisfiedByDomain: Record<AcsDomain, number[]> = {
    general: [],
    airframe: [],
    powerplant: [],
  };
  satisfiedCodeIds.forEach((acsId) => {
    const d = acsToDomain[acsId];
    if (d) satisfiedByDomain[d].push(acsId);
  });

  return {
    general: { satisfied: satisfiedByDomain.general.length, total: totalByDomain.general, satisfiedCodeIds: satisfiedByDomain.general },
    airframe: { satisfied: satisfiedByDomain.airframe.length, total: totalByDomain.airframe, satisfiedCodeIds: satisfiedByDomain.airframe },
    powerplant: { satisfied: satisfiedByDomain.powerplant.length, total: totalByDomain.powerplant, satisfiedCodeIds: satisfiedByDomain.powerplant },
  };
}

/** Get ACS coverage keyed by ATA chapter (codes can appear in multiple chapters via ata_chapters) */
export async function getAcsCoverageByChapter(
  userTrainingId: string,
  ataChapterNumbers: string[]
): Promise<AcsCoverageByChapter> {
  const supabase = await createServerSupabaseClient();

  const [{ data: acsCodes }, { data: ataChapters }] = await Promise.all([
    supabase.from("acs_code").select("id, ata_chapters, domain").order("id"),
    supabase.from("ata_chapter").select("id, chapter_number"),
  ]);

  const idToChapter = Object.fromEntries(
    (ataChapters ?? []).map((c) => [String(c.id), normalizeChapterNumber(c.chapter_number)])
  );

  const totalByChapter: Record<string, number> = {};
  const acsToChapters: Record<number, string[]> = {};
  (acsCodes ?? []).forEach((ac) => {
    const chapterIds = (ac.ata_chapters as number[] ?? []);
    const chapters = chapterIds
      .map((id) => idToChapter[String(id)])
      .filter((ch): ch is string => ch != null);
    acsToChapters[ac.id] = chapters;
    chapters.forEach((ch) => {
      totalByChapter[ch] = (totalByChapter[ch] ?? 0) + 1;
    });
  });

  const { data: approvedEntries } = await supabase
    .from("logbook_entries")
    .select("id")
    .eq("user_training_id", userTrainingId)
    .eq("status", "approved");

  const approvedIds = (approvedEntries ?? []).map((e) => e.id);
  const satisfiedCodeIds = new Set<number>();
  if (approvedIds.length > 0) {
    const { data: approvedAcs } = await supabase
      .from("logbook_entry_acs")
      .select("logbook_entry_id, acs_code_id")
      .in("logbook_entry_id", approvedIds);
    (approvedAcs ?? []).forEach((row) => satisfiedCodeIds.add(row.acs_code_id));
  }

  const satisfiedByChapter: Record<string, number[]> = {};
  satisfiedCodeIds.forEach((acsId) => {
    const chapters = acsToChapters[acsId] ?? [];
    chapters.forEach((ch) => {
      if (!satisfiedByChapter[ch]) satisfiedByChapter[ch] = [];
      satisfiedByChapter[ch].push(acsId);
    });
  });

  const byDomain = await getAcsCoverageByDomain(userTrainingId);

  const result: AcsCoverageByChapter = {};
  for (const ch of ataChapterNumbers) {
    if (totalByChapter[ch] !== undefined) {
      const ids = satisfiedByChapter[ch] ?? [];
      result[ch] = { satisfied: ids.length, total: totalByChapter[ch], satisfiedCodeIds: ids };
    } else {
      const domain = getDomainForAtaChapter(ch);
      result[ch] = byDomain[domain];
    }
  }
  return result;
}

/** ACS signoffs: acs_code_id -> { signed_at, signer_initials, signer_full_name } for an apprentice */
export async function getAcsSignoffsByApprentice(
  apprenticeUserId: string
): Promise<Record<number, { signed_at: string; signer_initials: string; signer_full_name: string }>> {
  const supabase = await createServerSupabaseClient();

  const { data: signoffs, error } = await supabase
    .from("acs_signoff")
    .select("acs_code_id, signed_at, signer_id")
    .eq("apprentice_user_id", apprenticeUserId);

  if (error || !signoffs?.length) {
    if (error) console.error("Error fetching ACS signoffs:", error);
    return {};
  }

  const signerIds = [...new Set(signoffs.map((s) => s.signer_id))];
  const { data: signers } = await supabase
    .from("users")
    .select("id, full_name")
    .in("id", signerIds);

  const profileMap = Object.fromEntries((signers ?? []).map((p) => [p.id, p.full_name ?? ""]));

  const result: Record<number, { signed_at: string; signer_initials: string; signer_full_name: string }> = {};
  signoffs.forEach((row) => {
    const fullName = profileMap[row.signer_id] ?? "";
    const initials = fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((part: string) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "—";
    result[row.acs_code_id] = {
      signed_at: row.signed_at,
      signer_initials: initials,
      signer_full_name: fullName || "Unknown",
    };
  });
  return result;
}

/** Mentor signs an ACS code for an apprentice. Inserts into acs_signoff and notifies apprentice. */
export async function signAcsCode(params: {
  acsCodeId: number;
  acsCode: string;
  acsDescription: string;
  apprenticeUserId: string;
  userTrainingId: string;
}): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { data: userTraining } = await supabase
    .from("user_trainings")
    .select("mentor_id")
    .eq("id", params.userTrainingId)
    .single();

  if (!userTraining || userTraining.mentor_id !== user.id) {
    return { error: "Not authorized to sign for this apprentice." };
  }

  const { error: insertError } = await supabase.from("acs_signoff").insert({
    acs_code_id: params.acsCodeId,
    apprentice_user_id: params.apprenticeUserId,
    signer_id: user.id,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: "This ACS code is already signed." };
    }
    console.error("Error signing ACS code:", insertError);
    return { error: insertError.message };
  }

  const { data: mentorProfile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const mentorName = mentorProfile?.full_name ?? "Your mentor";
  const message = `ACS code ${params.acsCode} signed by ${mentorName}`;

  const { error: notifError } = await supabase.rpc("create_acs_signed_notification", {
    p_recipient_user_id: params.apprenticeUserId,
    p_subject_user_id: user.id,
    p_subject_display_name: mentorName,
    p_message: message,
  });

  if (notifError) {
    console.error("Failed to create ACS signed notification:", notifError);
  }

  revalidatePath("/dashboard/mentor/mentees/progress");
  revalidatePath("/dashboard/apprentice/progress");
  return {};
}

export type LogbookEntryForAcs = {
  id: string;
  entry_date: string;
  hours_worked: number;
  description: string;
  status: string;
};

/** Returns logbook entries grouped by ACS code ID (from both approved and pending) */
export async function getLogbookEntriesByAcsCode(
  userTrainingId: string
): Promise<Record<number, LogbookEntryForAcs[]>> {
  const supabase = await createServerSupabaseClient();

  const { data: entries } = await supabase
    .from("logbook_entries")
    .select("id, entry_date, hours_worked, description, status")
    .eq("user_training_id", userTrainingId);

  if (!entries || entries.length === 0) {
    return {};
  }

  const entryIds = entries.map((e) => e.id);
  const entryMap = Object.fromEntries(entries.map((e) => [e.id, e]));

  const [pendingRes, approvedRes] = await Promise.all([
    supabase
      .from("logbook_entry_acs_pending")
      .select("logbook_entry_id, acs_code_id")
      .in("logbook_entry_id", entryIds),
    supabase
      .from("logbook_entry_acs")
      .select("logbook_entry_id, acs_code_id")
      .in("logbook_entry_id", entryIds),
  ]);

  const rows = [
    ...(pendingRes.data ?? []),
    ...(approvedRes.data ?? []),
  ];

  const byAcsCode: Record<number, Set<string>> = {};
  rows.forEach((row) => {
    const acsId = row.acs_code_id as number;
    const entryId = row.logbook_entry_id as string;
    if (!byAcsCode[acsId]) byAcsCode[acsId] = new Set();
    byAcsCode[acsId].add(entryId);
  });

  const result: Record<number, LogbookEntryForAcs[]> = {};
  Object.entries(byAcsCode).forEach(([acsIdStr, entryIdSet]) => {
    const acsId = Number(acsIdStr);
    const acsEntries = [...entryIdSet]
      .map((id) => entryMap[id])
      .filter(Boolean)
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
    result[acsId] = acsEntries;
  });

  return result;
}

"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { AtaChapter } from "@/app/actions/ata-chapters";
import {
  normalizeChapterNumber,
  getDomainForAtaChapter,
  type AcsDomain,
} from "@/lib/acs-utils";
import { sortByAcsCode } from "@/lib/acs-code-sort";

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

  return sortByAcsCode(
    (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as number,
      code: row.code as string,
      domain: row.domain as AcsDomain,
      subject_letter: String(row.subject_letter ?? ""),
      subject: String(row.subject ?? ""),
      category: row.category as AcsCategory,
      description: String(row.description ?? ""),
      ata_chapters: (row.ata_chapters as number[]) ?? [],
    }))
  );
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
  const ordered = sortByAcsCode(codes);
  const allIds = [...new Set(ordered.flatMap((c) => c.ata_chapters))];
  if (allIds.length === 0) {
    return ordered.map((c) => ({ ...c, ata_chapter_numbers: [] }));
  }
  const { data: chapters } = await supabase
    .from("ata_chapter")
    .select("id, chapter_number")
    .in("id", allIds);
  const idToNum = Object.fromEntries(
    (chapters ?? []).map((c) => [String(c.id), normalizeChapterNumber(c.chapter_number)])
  );
  return ordered.map((c) => ({
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
  return sortByAcsCode(
    (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as number,
      code: row.code as string,
      domain: row.domain as AcsDomain,
      subject_letter: String(row.subject_letter ?? ""),
      subject: String(row.subject ?? ""),
      category: row.category as AcsCategory,
      description: String(row.description ?? ""),
      ata_chapters: (row.ata_chapters as number[]) ?? [],
    }))
  );
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

  const satisfiedCodeIds = new Set<number>();

  if (approvedIds.length > 0) {
    const { data: approvedAcs } = await supabase
      .from("logbook_entry_acs")
      .select("logbook_entry_id, acs_code_id")
      .in("logbook_entry_id", approvedIds);
    (approvedAcs ?? []).forEach((row) => satisfiedCodeIds.add(row.acs_code_id));
  }

  const { data: approvedSubmissions } = await supabase
    .from("lesson_submissions")
    .select("lesson_id, lessons:lesson_id ( acs_codes )")
    .eq("user_training_id", userTrainingId)
    .eq("status", "approved")
    .not("approved_by", "is", null);

  (approvedSubmissions ?? []).forEach((row) => {
    const lesson = row.lessons as { acs_codes?: number[] } | null;
    const codes = Array.isArray(lesson?.acs_codes) ? lesson!.acs_codes! : [];
    codes.forEach((id) => satisfiedCodeIds.add(id));
  });

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

  const { data: approvedSubCh } = await supabase
    .from("lesson_submissions")
    .select("lesson_id, lessons:lesson_id ( acs_codes )")
    .eq("user_training_id", userTrainingId)
    .eq("status", "approved")
    .not("approved_by", "is", null);
  (approvedSubCh ?? []).forEach((row) => {
    const lesson = row.lessons as { acs_codes?: number[] } | null;
    (Array.isArray(lesson?.acs_codes) ? lesson!.acs_codes! : []).forEach((id) =>
      satisfiedCodeIds.add(id)
    );
  });

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

function initialsFromFullName(fullName: string): string {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "—"
  );
}

type SignoffEvent = { acsCodeId: number; atMs: number; signerId: string };

/** ACS “sign” display data from approved logbook lines and approved lesson submissions (earliest per code). */
export async function getAcsSignoffsByStudent(
  studentUserId: string
): Promise<Record<number, { signed_at: string; signer_initials: string; signer_full_name: string }>> {
  const supabase = await createServerSupabaseClient();

  const { data: utRows } = await supabase
    .from("user_trainings")
    .select("id")
    .eq("user_id", studentUserId);
  if (!utRows?.length) return {};
  const utIds = utRows.map((r) => r.id);

  const events: SignoffEvent[] = [];

  const { data: logEntries, error: logErr } = await supabase
    .from("logbook_entries")
    .select("id, approved_at, approved_by")
    .in("user_training_id", utIds)
    .eq("status", "approved")
    .not("approved_by", "is", null);
  if (logErr) console.error("Error fetching logbook entries for ACS signoffs:", logErr);

  const logEntryIds = (logEntries ?? []).map((e) => e.id);
  const logById = Object.fromEntries((logEntries ?? []).map((e) => [e.id, e]));
  if (logEntryIds.length > 0) {
    const { data: lea } = await supabase
      .from("logbook_entry_acs")
      .select("logbook_entry_id, acs_code_id")
      .in("logbook_entry_id", logEntryIds);
    (lea ?? []).forEach((row) => {
      const e = logById[row.logbook_entry_id as string];
      if (!e?.approved_at || !e.approved_by) return;
      events.push({
        acsCodeId: row.acs_code_id as number,
        atMs: new Date(e.approved_at as string).getTime(),
        signerId: e.approved_by as string,
      });
    });
  }

  const { data: subs, error: subErr } = await supabase
    .from("lesson_submissions")
    .select("approved_at, approved_by, status, lessons:lesson_id(acs_codes)")
    .in("user_training_id", utIds)
    .eq("status", "approved")
    .not("approved_by", "is", null);
  if (subErr) console.error("Error fetching lesson submissions for ACS signoffs:", subErr);
  (subs ?? []).forEach((row) => {
    const at = row.approved_at as string | null;
    const by = row.approved_by as string | null;
    if (!at || !by) return;
    const lesson = row.lessons as { acs_codes?: number[] } | null;
    const codes = Array.isArray(lesson?.acs_codes) ? lesson!.acs_codes! : [];
    const atMs = new Date(at).getTime();
    codes.forEach((acsId) => events.push({ acsCodeId: acsId, atMs, signerId: by }));
  });

  const bestByAcs = new Map<number, SignoffEvent>();
  for (const ev of events) {
    const prev = bestByAcs.get(ev.acsCodeId);
    if (!prev || ev.atMs < prev.atMs) bestByAcs.set(ev.acsCodeId, ev);
  }
  if (bestByAcs.size === 0) return {};

  const signerIds = [...new Set([...bestByAcs.values()].map((e) => e.signerId))];
  const { data: signers } = await supabase.from("users").select("id, full_name").in("id", signerIds);
  const nameById = Object.fromEntries((signers ?? []).map((p) => [p.id, p.full_name ?? ""]));

  const result: Record<number, { signed_at: string; signer_initials: string; signer_full_name: string }> = {};
  bestByAcs.forEach((ev, acsId) => {
    const fullName = nameById[ev.signerId] ?? "";
    result[acsId] = {
      signed_at: new Date(ev.atMs).toISOString(),
      signer_initials: initialsFromFullName(fullName),
      signer_full_name: fullName || "Unknown",
    };
  });
  return result;
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

"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export type AcsCode = {
  id: number;
  code: string;
  type: string;
  description: string;
};

export async function getAcsCodesByChapter(chapterNumber: string): Promise<AcsCode[]> {
  const supabase = await createServerSupabaseClient();

  const { data: ataChapter, error: chapterError } = await supabase
    .from("ata_chapter")
    .select("id")
    .eq("chapter_number", chapterNumber)
    .maybeSingle();

  if (chapterError || !ataChapter) {
    return [];
  }

  const { data, error } = await supabase
    .from("acs_code")
    .select("*")
    .eq("ata_chapter_id", ataChapter.id)
    .order("code", { ascending: true });

  if (error) {
    console.error("Error fetching ACS codes:", error);
    return [];
  }

  // Explicitly map response to ensure description is passed through
  const codes = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    code: row.code as string,
    type: row.type as string,
    description: String(row.description ?? ""),
  }));

  return codes;
}

/** ACS coverage per chapter: satisfied count, total count, and IDs of satisfied codes */
export type AcsCoverageByChapter = Record<
  string,
  { satisfied: number; total: number; satisfiedCodeIds: number[] }
>;

export async function getAcsCoverageByChapter(
  apprenticeId: string
): Promise<AcsCoverageByChapter> {
  const supabase = await createServerSupabaseClient();

  // Get total ACS codes per chapter (ata_chapter.chapter_number)
  const { data: acsCodes } = await supabase
    .from("acs_code")
    .select("id, ata_chapter_id")
    .order("id");

  const { data: ataChapters } = await supabase
    .from("ata_chapter")
    .select("id, chapter_number");

  const chapterByAtaId = Object.fromEntries(
    (ataChapters ?? []).map((c) => [c.id, c.chapter_number])
  );

  const totalByChapter: Record<string, number> = {};
  const acsToChapter: Record<number, string> = {};
  (acsCodes ?? []).forEach((ac) => {
    const ch = chapterByAtaId[ac.ata_chapter_id];
    if (ch) {
      totalByChapter[ch] = (totalByChapter[ch] ?? 0) + 1;
      acsToChapter[ac.id] = ch;
    }
  });

  // Get satisfied ACS codes from logbook_entry_acs (approved entries)
  const { data: approvedEntries } = await supabase
    .from("logbook_entries")
    .select("id")
    .eq("apprentice_id", apprenticeId)
    .eq("status", "approved");

  const approvedIds = (approvedEntries ?? []).map((e) => e.id);
  if (approvedIds.length === 0) {
    return Object.fromEntries(
      Object.entries(totalByChapter).map(([ch, total]) => [
        ch,
        { satisfied: 0, total, satisfiedCodeIds: [] },
      ])
    );
  }

  const { data: approvedAcs } = await supabase
    .from("logbook_entry_acs")
    .select("logbook_entry_id, acs_code_id")
    .in("logbook_entry_id", approvedIds);

  const satisfiedCodeIds = new Set<number>();
  (approvedAcs ?? []).forEach((row) => {
    satisfiedCodeIds.add(row.acs_code_id);
  });

  const satisfiedByChapter: Record<string, number[]> = {};
  satisfiedCodeIds.forEach((acsId) => {
    const ch = acsToChapter[acsId];
    if (ch) {
      if (!satisfiedByChapter[ch]) satisfiedByChapter[ch] = [];
      satisfiedByChapter[ch].push(acsId);
    }
  });

  const result: AcsCoverageByChapter = {};
  Object.entries(totalByChapter).forEach(([ch, total]) => {
    const ids = satisfiedByChapter[ch] ?? [];
    result[ch] = { satisfied: ids.length, total, satisfiedCodeIds: ids };
  });
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
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", signerIds);

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? ""]));

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
  apprenticeId: string;
}): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { data: apprentice } = await supabase
    .from("apprentices")
    .select("mentor_id")
    .eq("id", params.apprenticeId)
    .single();

  if (!apprentice || apprentice.mentor_id !== user.id) {
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
    .from("profiles")
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
  apprenticeId: string
): Promise<Record<number, LogbookEntryForAcs[]>> {
  const supabase = await createServerSupabaseClient();

  const { data: entries } = await supabase
    .from("logbook_entries")
    .select("id, entry_date, hours_worked, description, status")
    .eq("apprentice_id", apprenticeId);

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

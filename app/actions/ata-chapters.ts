"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export type AtaChapter = {
  id: number;
  chapter_number: string;
  title: string;
  description: string | null;
};

/** Normalize chapter number to two digits (e.g. "9" -> "09") */
function normalizeChapterNumber(ch: string): string {
  const s = String(ch ?? "").trim();
  if (s.length === 1 && /^\d$/.test(s)) return "0" + s;
  return s;
}

/** Get a single ATA chapter by ID. Returns null if not found. */
export async function getAtaChapterById(id: number): Promise<AtaChapter | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ata_chapter")
    .select("id, chapter_number, title, description")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...data,
    chapter_number: normalizeChapterNumber(data.chapter_number),
  } as AtaChapter;
}

export async function getAtaChapters(): Promise<AtaChapter[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ata_chapter")
    .select("id, chapter_number, title, description")
    .order("chapter_number", { ascending: true });

  if (error) {
    console.error("Error fetching ATA chapters:", error);
    return [];
  }

  return (data ?? []).map((c) => ({
    ...c,
    chapter_number: normalizeChapterNumber(c.chapter_number),
  }));
}

"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export type AtaChapter = {
  id: number;
  chapter_number: string;
  title: string;
  description: string | null;
};

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

  return data ?? [];
}

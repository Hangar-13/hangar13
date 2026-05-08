"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export type LogbookEquipmentKind = "aircraft" | "engine" | "propeller";

function escapeIlikeMetacharacters(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function searchLogbookEquipmentCatalog(
  kind: LogbookEquipmentKind,
  query: string
): Promise<{ labels: string[] } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "You must be logged in." };
  }

  const q = query.trim();
  let req = supabase
    .from("logbook_equipment_catalog")
    .select("label")
    .eq("kind", kind)
    .order("label", { ascending: true })
    .limit(40);

  if (q.length > 0) {
    const escaped = escapeIlikeMetacharacters(q);
    req = req.ilike("label", `%${escaped}%`);
  }

  const { data, error } = await req;
  if (error) {
    return { error: error.message };
  }
  const labels = Array.from(new Set((data ?? []).map((row) => row.label as string)));
  return { labels };
}

export async function recordLogbookEquipmentTermsUsed(params: {
  aircraft: string | null;
  engine: string | null;
  propeller: string | null;
}): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return;
  }

  const entries: { kind: LogbookEquipmentKind; label: string }[] = [];
  const a = params.aircraft?.trim();
  if (a) entries.push({ kind: "aircraft", label: a });
  const e = params.engine?.trim();
  if (e) entries.push({ kind: "engine", label: e });
  const p = params.propeller?.trim();
  if (p) entries.push({ kind: "propeller", label: p });

  for (const row of entries) {
    const { error } = await supabase.rpc("ensure_logbook_equipment_catalog_label", {
      p_kind: row.kind,
      p_label: row.label,
    });
    if (error) {
      console.error("ensure_logbook_equipment_catalog_label:", error);
    }
  }
}

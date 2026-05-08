"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getActiveUser } from "@/lib/auth";
import { hasPlatformAdminAccess } from "@/lib/auth-shared";

const createPersonaSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(500),
});

function normalizeOptionalEmail(raw: string | undefined): string | null {
  const t = raw?.trim() ?? "";
  if (!t) return null;
  const ok = z.string().email().safeParse(t);
  if (!ok.success) {
    throw new Error("Invalid email");
  }
  return t;
}

export async function createDirectoryHiddenUser(input: {
  fullName: string;
  email?: string;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getActiveUser();
  if (!user || !hasPlatformAdminAccess(user.role)) {
    return { ok: false, error: "Forbidden" };
  }

  const parsed = createPersonaSchema.safeParse({
    fullName: input.fullName.trim(),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let pEmail: string | null;
  try {
    pEmail = normalizeOptionalEmail(input.email);
  } catch {
    return { ok: false, error: "Invalid email" };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_directory_hidden_user", {
    p_full_name: parsed.data.fullName,
    p_email: pEmail,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || typeof data !== "string") {
    return { ok: false, error: "Invalid response" };
  }

  return { ok: true, userId: data };
}

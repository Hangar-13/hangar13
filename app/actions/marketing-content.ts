"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getActiveUser } from "@/lib/auth";
import { hasPlatformAdminAccess } from "@/lib/auth-shared";
import { MARKETING_HOME_SLUG } from "@/lib/marketing/fetch-landing-content";
import {
  parseLandingContent,
  type LandingContent,
} from "@/lib/marketing/landing-content";

export async function saveMarketingLandingContent(
  content: LandingContent
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getActiveUser();
  if (!user || !hasPlatformAdminAccess(user.role)) {
    return { ok: false, error: "Forbidden" };
  }

  const parsed = parseLandingContent(content);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_pages")
    .update({
      content: parsed,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("slug", MARKETING_HOME_SLUG)
    .select("slug")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      error:
        "Landing page record is missing. Apply the latest database migration, then try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/marketing/preview");
  revalidatePath("/dashboard/god/landing");
  return { ok: true };
}

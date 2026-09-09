import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  DEFAULT_LANDING_CONTENT,
  parseLandingContent,
  type LandingContent,
} from "@/lib/marketing/landing-content";

export const MARKETING_HOME_SLUG = "home";

export async function fetchLandingContent(): Promise<LandingContent> {
  const page = await fetchMarketingHomePage();
  return page.content;
}

export async function fetchMarketingHomePage(): Promise<{
  content: LandingContent;
  updatedAt: string | null;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("marketing_pages")
      .select("content, updated_at")
      .eq("slug", MARKETING_HOME_SLUG)
      .maybeSingle();

    if (error || !data) {
      return { content: DEFAULT_LANDING_CONTENT, updatedAt: null };
    }

    return {
      content: parseLandingContent(data.content),
      updatedAt: data.updated_at ?? null,
    };
  } catch {
    return { content: DEFAULT_LANDING_CONTENT, updatedAt: null };
  }
}

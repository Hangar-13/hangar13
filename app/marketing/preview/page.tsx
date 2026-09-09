import { requirePlatformAdmin } from "@/lib/god-guard";
import { fetchLandingContent } from "@/lib/marketing/fetch-landing-content";
import { LandingPage } from "@/components/marketing/landing-page";

export const dynamic = "force-dynamic";

export default async function MarketingPreviewPage() {
  await requirePlatformAdmin();
  const content = await fetchLandingContent();
  return <LandingPage content={content} preview />;
}

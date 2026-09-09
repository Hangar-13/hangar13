import { requirePlatformAdmin } from "@/lib/god-guard";
import { fetchMarketingHomePage } from "@/lib/marketing/fetch-landing-content";
import { LandingContentEditor } from "@/components/god/landing-content-editor";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";

export const dynamic = "force-dynamic";

export default async function GodLandingPage() {
  await requirePlatformAdmin();
  const page = await fetchMarketingHomePage();

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Landing page</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Change the public website wording and pricing here. Your partner does not
          need access to the code — save, then Preview to see the live page.
        </p>
      </div>
      <DashboardContentFrame>
        <LandingContentEditor
          initialContent={page.content}
          updatedAt={page.updatedAt}
        />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

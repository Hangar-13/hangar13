import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import {
  getActivePriorOjtAssessment,
  getPriorOjtCatalog,
} from "@/app/actions/prior-ojt";
import { PriorOjtWizard } from "@/components/student/prior-ojt/prior-ojt-wizard";

export default async function PriorOjtExperiencePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [{ data: profile }, catalog, ataChapters, active] = await Promise.all([
    supabase.from("users").select("full_name, email").eq("id", user.id).maybeSingle(),
    getPriorOjtCatalog(),
    getAtaChapters(),
    getActivePriorOjtAssessment(),
  ]);

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Prior OJT Experience</h1>
        <p className="text-base text-muted-foreground">
          Walk through ACS subjects, claim the codes you already know, then review draft
          logbook entries before they become part of your OJT logbook.
        </p>
        <p className="text-sm text-muted-foreground">
          Return to{" "}
          <Link
            href="/dashboard/student/skills"
            className="text-primary underline underline-offset-4"
          >
            Skills profile
          </Link>
          .
        </p>
      </div>

      {active.error ? (
        <p className="text-sm text-destructive">{active.error}</p>
      ) : (
        <PriorOjtWizard
          catalog={catalog}
          ataChapters={ataChapters}
          initialAssessment={active.assessment}
          initialClaims={active.claims}
          initialProposedEntries={active.proposedEntries}
          defaultFullName={profile?.full_name?.trim() || ""}
          defaultEmail={profile?.email?.trim() || user.email || ""}
        />
      )}
    </DashboardPageShell>
  );
}

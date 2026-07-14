import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { getSkillsProfileForUser } from "@/app/actions/skills-profile";
import { SkillsProfilePageClient } from "@/components/skills/skills-profile-page-client";
import { DashboardPageShell } from "@/components/dashboard/page-shell";

export default async function StudentSkillsProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const result = await getSkillsProfileForUser(user.id);
  if ("error" in result) {
    return (
      <DashboardPageShell>
        <h1 className="text-2xl font-bold tracking-tight">Skills profile</h1>
        <p className="text-base text-muted-foreground">{result.error}</p>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell className="space-y-6">
      <SkillsProfilePageClient profile={result.data} />
    </DashboardPageShell>
  );
}

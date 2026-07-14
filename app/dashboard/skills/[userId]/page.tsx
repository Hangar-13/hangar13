import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { getSkillsProfileForUser } from "@/app/actions/skills-profile";
import { SkillsProfilePageClient } from "@/components/skills/skills-profile-page-client";
import { DashboardPageShell } from "@/components/dashboard/page-shell";

type PageProps = {
  params: Promise<{ userId: string }>;
};

export default async function UserSkillsProfilePage({ params }: PageProps) {
  const { userId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (userId === user.id) {
    redirect("/dashboard/student/skills");
  }

  const result = await getSkillsProfileForUser(userId);
  if ("error" in result) {
    if (result.error.includes("permission")) {
      notFound();
    }
    return (
      <DashboardPageShell>
        <h1 className="text-2xl font-bold tracking-tight">Skills profile</h1>
        <p className="text-base text-muted-foreground">{result.error}</p>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell className="space-y-6">
      <SkillsProfilePageClient
        profile={result.data}
        backHref="/dashboard/mentor/mentees"
        backLabel="Back to students"
      />
    </DashboardPageShell>
  );
}

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { ProgressTrackingDashboard } from "@/components/apprentice/progress-tracking-dashboard";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForApprentice } from "@/app/actions/progress";

export default async function ProgressPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: apprentice, error: apprenticeError } = await supabase
    .from("apprentices")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (apprenticeError || !apprentice) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Progress Tracking</h1>
          <p className="text-muted-foreground text-base">
            No apprentice record found. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const [progressData, ataChapters] = await Promise.all([
    getProgressDataForApprentice(apprentice),
    getAtaChapters(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Progress Tracking</h1>
        <p className="text-muted-foreground text-base">
          Track your progress through the 30-month program
        </p>
      </div>

      <ProgressTrackingDashboard
        progressData={progressData}
        ataChapters={ataChapters.map((c) => ({
          chapter_number: c.chapter_number,
          title: c.title,
        }))}
      />
    </div>
  );
}

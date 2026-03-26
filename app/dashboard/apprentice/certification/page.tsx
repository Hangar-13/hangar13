import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { getProgressDataForApprentice } from "@/app/actions/progress";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getCertificationAwardsForUser } from "@/app/actions/user-credentials";
import { getAcsCertificationProgressStats } from "@/app/actions/acs-certification-progress";
import { CertificationDashboardClient } from "@/components/apprentice/certification-dashboard-client";

export default async function ApprenticeCertificationPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const ctx = await getCurrentUserTrainingContext(supabase, user.id);

  if (!ctx.userTraining) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Certification</h1>
          <p className="text-muted-foreground text-base">
            No active training selected. Use{" "}
            <Link href="/dashboard/apprentice/find-training" className="text-primary underline underline-offset-4">
              Find Training
            </Link>{" "}
            to choose a program.
          </p>
        </div>
      </div>
    );
  }

  const [progressData, ataChapters, certificationAwards, acsProgressStats] = await Promise.all([
    getProgressDataForApprentice(ctx.userTraining),
    getAtaChapters(),
    getCertificationAwardsForUser(user.id),
    getAcsCertificationProgressStats(user.id, ctx.currentCertification),
  ]);

  const hasCurrentCert = ctx.currentCertification != null;
  const hasCompletedCerts = certificationAwards.length > 0;
  const defaultExistingOpen = !hasCurrentCert && hasCompletedCerts;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Certification</h1>
        <p className="text-muted-foreground text-base">
          Completed certifications and ACS code progress toward your FAA goal
        </p>
      </div>

      <CertificationDashboardClient
        currentCertification={ctx.currentCertification}
        certificationAwards={certificationAwards}
        progressData={progressData}
        ataChapters={ataChapters.map((c) => ({
          chapter_number: c.chapter_number,
          title: c.title,
        }))}
        defaultExistingOpen={defaultExistingOpen}
        acsProgressStats={acsProgressStats}
      />
    </div>
  );
}

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { getProgressDataForUser } from "@/app/actions/progress";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getCertificationAwardsForUser } from "@/app/actions/user-credentials";
import { getAcsCertificationProgressStats } from "@/app/actions/acs-certification-progress";
import { CertificationDashboardClient } from "@/components/student/certification-dashboard-client";

export default async function StudentCertificationPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const ctx = await getCurrentUserTrainingContext(supabase, user.id);

  const [progressData, ataChapters, certificationAwards, acsProgressStats] = await Promise.all([
    getProgressDataForUser(user.id),
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

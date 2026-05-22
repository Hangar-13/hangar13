import Link from "next/link";
import { requireOrgSupervisorDashboard } from "@/lib/org-supervisor-guard";
import { loadOrgSubscriptions } from "@/lib/org-dashboard-data";
import { OrgSubscriptionsPanel } from "@/components/organization/org-subscriptions-panel";
import { OrgCourseVersionPanel, type OrgCourseVersionRow } from "@/components/organization/org-course-version-panel";
import { orgListCourseVersionPinsForPath } from "@/app/actions/course-version-adoption";
import { DashboardContentFrame, DashboardPageShell } from "@/components/dashboard/page-shell";

export default async function OrganizationSubscriptionsPage() {
  const ctx = await requireOrgSupervisorDashboard();
  const rows = await loadOrgSubscriptions(ctx.organizationId);

  const courseVersionSections: Array<{
    trainingPathId: string;
    trainingPathName: string;
    rows: OrgCourseVersionRow[];
  }> = [];

  for (const row of rows) {
    if (!row.trainingPathId) continue;
    const res = await orgListCourseVersionPinsForPath(row.trainingPathId);
    if (res.ok && res.rows.length > 0) {
      courseVersionSections.push({
        trainingPathId: row.trainingPathId,
        trainingPathName: row.trainingPathName,
        rows: res.rows,
      });
    }
  }

  return (
    <DashboardPageShell>
      <div>
        <Link
          href="/dashboard/organization"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organization overview
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Seat counts and renewal dates for training paths owned by{" "}
          <span className="font-medium text-foreground">{ctx.organizationName}</span>.
        </p>
      </div>

      <DashboardContentFrame>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No training paths in this organization yet.
          </p>
        ) : (
          <div className="space-y-8">
            <OrgSubscriptionsPanel rows={rows} />
            {courseVersionSections.length > 0 ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Course versions</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Control which course version your learners see for org-managed
                    enrollments. Self-enrolled users adopt updates individually.
                  </p>
                </div>
                {courseVersionSections.map((section) => (
                  <OrgCourseVersionPanel
                    key={section.trainingPathId}
                    trainingPathId={section.trainingPathId}
                    trainingPathName={section.trainingPathName}
                    rows={section.rows}
                  />
                ))}
              </section>
            ) : null}
          </div>
        )}
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

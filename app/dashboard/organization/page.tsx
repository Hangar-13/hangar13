import Link from "next/link";
import { requireOrgSupervisorDashboard } from "@/lib/org-supervisor-guard";
import {
  loadOrgOverview,
  loadOrgSubscriptions,
  loadOrgMembers,
} from "@/lib/org-dashboard-data";
import { Button } from "@/components/ui/button";
import {
  DashboardContentFrame,
  DashboardPageShell,
  DashboardSectionLabel,
  DashboardStatCell,
  DashboardStatStrip,
  DashboardTableShell,
} from "@/components/dashboard/page-shell";

export default async function OrganizationOverviewPage() {
  const ctx = await requireOrgSupervisorDashboard();
  const [overview, subscriptions, members] = await Promise.all([
    loadOrgOverview(ctx.organizationId),
    loadOrgSubscriptions(ctx.organizationId),
    loadOrgMembers(ctx.organizationId),
  ]);

  const pathsWithSeats = subscriptions.filter((s) => s.licensesPurchased > 0).length;

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{ctx.organizationName}</h1>
        <p className="text-base text-muted-foreground">
          Organization overview — subscriptions and learner progress for your tenant.
        </p>
      </div>

      <DashboardContentFrame>
        <DashboardStatStrip>
          <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-border/30">
            <DashboardStatCell value={overview.memberCount} label="Members" />
            <DashboardStatCell value={overview.activeEnrollments} label="Active enrollments" />
            <DashboardStatCell value={overview.completedEnrollments} label="Completed programs" />
            <DashboardStatCell value={pathsWithSeats} label="Training paths with seats" />
          </div>
        </DashboardStatStrip>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default">
            <Link href="/dashboard/organization/members">Manage members</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/organization/subscriptions">Subscriptions</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/organization/progress">Progress</Link>
          </Button>
        </div>

        <section className="space-y-3 border-t border-border/40 pt-6">
          <DashboardSectionLabel>Recent members</DashboardSectionLabel>
          <DashboardTableShell>
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.slice(0, 6).map((m) => (
                  <tr key={m.userId} className="border-b border-border/60 last:border-0">
                    <td className="p-3">{m.fullName?.trim() || m.email || "—"}</td>
                    <td className="p-3 capitalize text-muted-foreground">{m.orgRole}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DashboardTableShell>
        </section>
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

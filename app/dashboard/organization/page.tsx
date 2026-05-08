import Link from "next/link";
import { requireOrgSupervisorDashboard } from "@/lib/org-supervisor-guard";
import {
  loadOrgOverview,
  loadOrgSubscriptions,
  loadOrgMembers,
} from "@/lib/org-dashboard-data";
import { Button } from "@/components/ui/button";

export default async function OrganizationOverviewPage() {
  const ctx = await requireOrgSupervisorDashboard();
  const [overview, subscriptions, members] = await Promise.all([
    loadOrgOverview(ctx.organizationId),
    loadOrgSubscriptions(ctx.organizationId),
    loadOrgMembers(ctx.organizationId),
  ]);

  const pathsWithSeats = subscriptions.filter((s) => s.licensesPurchased > 0).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.organizationName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organization overview — subscriptions and learner progress for your tenant.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Members</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{overview.memberCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Active enrollments</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {overview.activeEnrollments}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Completed programs</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {overview.completedEnrollments}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Training paths with seats</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{pathsWithSeats}</p>
        </div>
      </div>

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

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recent members</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.slice(0, 6).map((m) => (
                <tr key={m.userId} className="border-b last:border-0">
                  <td className="p-3">{m.fullName?.trim() || m.email || "—"}</td>
                  <td className="p-3 capitalize text-muted-foreground">{m.orgRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { requireOrgSupervisorDashboard } from "@/lib/org-supervisor-guard";
import { loadOrgSubscriptions } from "@/lib/org-dashboard-data";
import { OrgSubscriptionsPanel } from "@/components/organization/org-subscriptions-panel";

export default async function OrganizationSubscriptionsPage() {
  const ctx = await requireOrgSupervisorDashboard();
  const rows = await loadOrgSubscriptions(ctx.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/organization"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organization overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seat counts and renewal dates for training paths owned by{" "}
          <span className="font-medium">{ctx.organizationName}</span>.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No training paths in this organization yet.
        </p>
      ) : (
        <OrgSubscriptionsPanel rows={rows} />
      )}
    </div>
  );
}

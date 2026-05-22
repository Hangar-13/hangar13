import Link from "next/link";
import { requireOrgSupervisorDashboard } from "@/lib/org-supervisor-guard";
import { loadOrgMembers } from "@/lib/org-dashboard-data";
import { OrgMembersPanel } from "@/components/organization/org-members-panel";
import { DashboardContentFrame, DashboardPageShell } from "@/components/dashboard/page-shell";

export default async function OrganizationMembersPage() {
  const ctx = await requireOrgSupervisorDashboard();
  const members = await loadOrgMembers(ctx.organizationId);

  return (
    <DashboardPageShell>
      <div>
        <Link
          href="/dashboard/organization"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organization overview
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Members</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Add users and set roles for{" "}
          <span className="font-medium text-foreground">{ctx.organizationName}</span>. Promoting
          someone to organization supervisor or lead still requires platform admin.
        </p>
      </div>

      <DashboardContentFrame>
        <OrgMembersPanel mode="supervisor" members={members} />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

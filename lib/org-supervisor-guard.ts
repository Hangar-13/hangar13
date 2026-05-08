import { redirect } from "next/navigation";
import { hasOrganizationRolePermission } from "@/lib/auth-shared";
import type { ActiveOrgDashboardContext } from "@/lib/org-dashboard-context";
import { getActiveOrgDashboardContext } from "@/lib/org-dashboard-context";

/** Server-only: requires active org where caller is organization supervisor or lead. */
export async function requireOrgSupervisorDashboard(): Promise<ActiveOrgDashboardContext> {
  const ctx = await getActiveOrgDashboardContext();
  if (
    !ctx ||
    !hasOrganizationRolePermission(ctx.organizationRole, "supervisor")
  ) {
    redirect("/dashboard/student");
  }
  return ctx;
}

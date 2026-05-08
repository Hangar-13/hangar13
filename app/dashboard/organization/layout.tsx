import type { ReactNode } from "react";
import { requireOrgSupervisorDashboard } from "@/lib/org-supervisor-guard";

export default async function OrganizationDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireOrgSupervisorDashboard();
  return <>{children}</>;
}

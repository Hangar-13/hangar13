import Link from "next/link";
import { requireOrgSupervisorDashboard } from "@/lib/org-supervisor-guard";
import { loadOrgProgressByMember } from "@/lib/org-dashboard-data";

export default async function OrganizationProgressPage() {
  const ctx = await requireOrgSupervisorDashboard();
  const rows = await loadOrgProgressByMember(ctx.organizationId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/organization"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organization overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enrollment activity across training paths in{" "}
          <span className="font-medium">{ctx.organizationName}</span>.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Learner</th>
              <th className="p-3 font-medium tabular-nums">Active</th>
              <th className="p-3 font-medium tabular-nums">Completed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-b last:border-0">
                <td className="p-3">
                  <span className="font-medium">
                    {r.fullName?.trim() || r.email || "—"}
                  </span>
                  {r.email && r.fullName?.trim() ? (
                    <span className="block text-xs text-muted-foreground">{r.email}</span>
                  ) : null}
                </td>
                <td className="p-3 tabular-nums text-muted-foreground">{r.activeCount}</td>
                <td className="p-3 tabular-nums text-muted-foreground">{r.completedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

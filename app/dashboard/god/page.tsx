import Link from "next/link";
import { Building2, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requirePlatformAdmin } from "@/lib/god-guard";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import {
  DashboardContentFrame,
  DashboardPageShell,
  DashboardSectionLabel,
  DashboardStatCell,
  DashboardStatStrip,
  DashboardTableShell,
} from "@/components/dashboard/page-shell";
import {
  AdminUserDonut,
  AdminUserDonutLegend,
} from "@/components/god/admin-user-donut";

export default async function AdminDashboardPage() {
  const user = await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();
  const firstName = user.full_name?.split(" ")[0] || "there";
  const data = await getAdminDashboardData(supabase);

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Platform overview: organizations, users, and membership.
        </p>
      </div>

      <DashboardContentFrame>
        <DashboardStatStrip>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-y-0 sm:divide-x sm:divide-border/30">
            <div className="flex items-start justify-between gap-4 px-4 first:pl-0 last:pr-0 sm:px-5">
              <DashboardStatCell
                value={data.totalOrganizations.toLocaleString()}
                label="Organizations"
                detail="Total on the platform"
              />
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/80">
                <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 first:pl-0 last:pr-0 sm:px-5">
              <DashboardStatCell
                value={data.totalUsers.toLocaleString()}
                label="Users"
                detail="Registered accounts"
              />
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/80">
                <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
            </div>
          </div>
        </DashboardStatStrip>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
          <section className="space-y-4">
            <DashboardSectionLabel>Top organizations</DashboardSectionLabel>
            {data.topOrganizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organizations yet.</p>
            ) : (
              <DashboardTableShell>
                <table className="w-full min-w-[20rem] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="p-3 pr-4 font-medium w-10">#</th>
                      <th className="p-3 pr-4 font-medium">Organization</th>
                      <th className="p-3 font-medium whitespace-nowrap text-right">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topOrganizations.map((row) => (
                      <tr key={row.id} className="border-b border-border/60 last:border-0">
                        <td className="p-3 pr-4 text-muted-foreground">{row.rank}</td>
                        <td className="p-3 pr-4 font-medium">
                          <Link
                            href={`/dashboard/god/organizations/${row.id}`}
                            className="rounded-sm text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="p-3 text-right tabular-nums">{row.memberCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DashboardTableShell>
            )}
          </section>

          <section className="space-y-4">
            <DashboardSectionLabel>User distribution</DashboardSectionLabel>
            <div className="flex flex-col items-center gap-6 py-2">
              <AdminUserDonut slices={data.userBreakdownSlices} totalUsers={data.totalUsers} />
              <AdminUserDonutLegend slices={data.userBreakdownSlices} />
            </div>
          </section>
        </div>
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

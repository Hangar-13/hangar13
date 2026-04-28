import Link from "next/link";
import { Building2, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requirePlatformAdmin } from "@/lib/god-guard";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground text-base max-w-2xl">
          Platform overview: organizations, users, and membership.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80">
              <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tabular-nums tracking-tight">
              {data.totalOrganizations.toLocaleString()}
            </div>
            <CardDescription className="mt-1">Total on the platform</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80">
              <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tabular-nums tracking-tight">
              {data.totalUsers.toLocaleString()}
            </div>
            <CardDescription className="mt-1">Registered accounts</CardDescription>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Top organizations</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topOrganizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organizations yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[20rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 pr-4 font-medium w-10">#</th>
                      <th className="pb-3 pr-4 font-medium">Organization</th>
                      <th className="pb-3 font-medium whitespace-nowrap text-right">
                        Members
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topOrganizations.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-3 pr-4 text-muted-foreground">{row.rank}</td>
                        <td className="py-3 pr-4 font-medium">
                          <Link
                            href={`/dashboard/god/organizations/${row.id}`}
                            className="text-foreground hover:text-primary focus-visible:text-primary hover:underline focus-visible:underline underline-offset-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="py-3 text-right tabular-nums">
                          {row.memberCount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>User distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <AdminUserDonut
              slices={data.userBreakdownSlices}
              totalUsers={data.totalUsers}
            />
            <AdminUserDonutLegend slices={data.userBreakdownSlices} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

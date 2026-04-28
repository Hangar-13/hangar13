import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { listOrganizationIdsWhereUserHasMinRole } from "@/lib/organization";
import { getManagerTopTrainingMaterials } from "@/lib/manager-dashboard";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ManagerDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          Your account profile could not be loaded
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Try signing out and signing back in, or contact an administrator.
        </p>
      </div>
    );
  }

  const firstName = profile.full_name?.split(" ")[0] || "there";

  const orgIds = await listOrganizationIdsWhereUserHasMinRole(
    supabase,
    user.id,
    "mentor"
  );
  if (orgIds.length === 0) {
    redirect("/dashboard/mentor");
  }

  const topMaterials = await getManagerTopTrainingMaterials(supabase, orgIds, {
    limit: 10,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground text-base max-w-2xl">
          Overview of training content across your organizations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top training paths</CardTitle>
          <CardDescription>
            By number of student enrollments in your organizations (top 10).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topMaterials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No training paths yet. Add content from{" "}
              <Link
                href="/dashboard/manager/content"
                className="text-primary underline underline-offset-4"
              >
                Content
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium w-10">#</th>
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium whitespace-nowrap">
                      # Students
                    </th>
                    <th className="pb-3 font-medium whitespace-nowrap">
                      Last update
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topMaterials.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-3 pr-4 align-top text-muted-foreground">
                        {row.rank}
                      </td>
                      <td className="py-3 pr-4 align-top font-medium">
                        <Link
                          href={row.href}
                          className="text-foreground hover:text-primary focus-visible:text-primary hover:underline focus-visible:underline underline-offset-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums">
                        {row.studentCount}
                      </td>
                      <td className="py-3 align-top text-muted-foreground whitespace-nowrap">
                        {row.lastUpdate
                          ? new Date(row.lastUpdate).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

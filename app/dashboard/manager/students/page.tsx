import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { listOrganizationIdsWhereUserHasMinRole } from "@/lib/organization";
import {
  DashboardContentFrame,
  DashboardPageShell,
  DashboardTableShell,
} from "@/components/dashboard/page-shell";

export default async function ManagerStudentsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const orgIds = await listOrganizationIdsWhereUserHasMinRole(
    supabase,
    user.id,
    "manager"
  );
  if (orgIds.length === 0) {
    redirect("/dashboard/manager");
  }

  const { data: members } = await supabase
    .from("user_organizations")
    .select("user_id")
    .in("organization_id", orgIds)
    .eq("role", "student");

  const userIds = [...new Set((members ?? []).map((row) => row.user_id as string))];
  const { data: profiles } =
    userIds.length === 0
      ? { data: [] }
      : await supabase.from("users").select("id, full_name, email").in("id", userIds);

  const { data: enrollments } =
    userIds.length === 0
      ? { data: [] }
      : await supabase
          .from("user_trainings")
          .select("user_id")
          .in("user_id", userIds)
          .eq("status", "active");
  const courseCount = new Map<string, number>();
  for (const row of enrollments ?? []) {
    const userId = row.user_id as string;
    courseCount.set(userId, (courseCount.get(userId) ?? 0) + 1);
  }

  const rows = (profiles ?? [])
    .map((profile) => {
      const count = courseCount.get(profile.id as string) ?? 0;
      return {
        id: profile.id as string,
        name: profile.full_name?.trim() || profile.email || "Learner",
        email: profile.email as string | null,
        detail:
          count === 0
            ? "Not enrolled"
            : count === 1
              ? "1 course"
              : `${count} courses`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Students</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Open a student to see which lesson revision they completed.
        </p>
      </div>

      <DashboardContentFrame>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this organization yet.</p>
        ) : (
          <DashboardTableShell>
            <ul className="divide-y divide-border/25">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/dashboard/mentor/student/${row.id}`}
                    className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/60"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{row.name}</span>
                      {row.email && row.name !== row.email ? (
                        <span className="block text-xs text-muted-foreground">{row.email}</span>
                      ) : null}
                      <span className="mt-1 block text-xs text-muted-foreground">{row.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </DashboardTableShell>
        )}
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

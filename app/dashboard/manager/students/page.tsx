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

  const { data: paths } = await supabase
    .from("training_paths")
    .select("id, name")
    .in("organization_id", orgIds);

  const pathName = new Map((paths ?? []).map((path) => [path.id as string, path.name as string]));
  const pathIds = [...pathName.keys()];

  const { data: enrollments } =
    pathIds.length === 0
      ? { data: [] }
      : await supabase
          .from("user_trainings")
          .select("id, user_id, training_path_id, status")
          .in("training_path_id", pathIds)
          .order("start_date", { ascending: false });

  const userIds = [...new Set((enrollments ?? []).map((row) => row.user_id as string))];
  const { data: profiles } =
    userIds.length === 0
      ? { data: [] }
      : await supabase.from("users").select("id, full_name, email").in("id", userIds);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));

  const rows = (enrollments ?? []).map((row) => {
    const profile = profileById.get(row.user_id as string);
    return {
      id: row.id as string,
      name: profile?.full_name?.trim() || profile?.email || "Learner",
      email: profile?.email as string | null,
      path: pathName.get(row.training_path_id as string) ?? "Training path",
      status: row.status as string | null,
    };
  });

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
          <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
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
                      <span className="mt-1 block text-xs text-muted-foreground">{row.path}</span>
                    </span>
                    {row.status ? (
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">
                        {row.status}
                      </span>
                    ) : null}
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

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { ManagerContentClient } from "@/components/manager/manager-content-client";
import { listOrganizationIdsWhereUserHasMinRole } from "@/lib/organization";

export default async function ManagerContentPage() {
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
    "mentor"
  );
  if (orgIds.length === 0) {
    redirect("/dashboard/mentor");
  }

  const [{ data: trainingPaths }, { data: courses }] = await Promise.all([
    supabase
      .from("training_paths")
      .select("id, name, visibility")
      .in("organization_id", orgIds)
      .order("name", { ascending: true }),
    supabase
      .from("courses")
      .select("id, name, description, visibility")
      .in("organization_id", orgIds)
      .order("name", { ascending: true }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Organization training content
        </h1>
        <p className="text-muted-foreground text-base max-w-2xl">
          Manage training paths and courses for organizations where you have
          mentor access or higher.
        </p>
      </div>

      <ManagerContentClient
        lists={{
          trainingPaths: trainingPaths ?? [],
          courses: courses ?? [],
        }}
      />
    </div>
  );
}

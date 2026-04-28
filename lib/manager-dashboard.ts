import type { SupabaseClient } from "@supabase/supabase-js";

export type ManagerTopMaterialRow = {
  rank: number;
  id: string;
  name: string;
  studentCount: number;
  lastUpdate: string;
  href: string;
};

/**
 * Top training paths in the caller's orgs by enrollment count (ties: newer update, then name).
 * Enrollments only exist on `training_paths`.
 */
export async function getManagerTopTrainingMaterials(
  supabase: SupabaseClient,
  orgIds: string[],
  options?: { limit?: number }
): Promise<ManagerTopMaterialRow[]> {
  const limit = options?.limit ?? 10;
  if (orgIds.length === 0) {
    return [];
  }

  const { data: pathRows } = await supabase
    .from("training_paths")
    .select("id, name, updated_at")
    .in("organization_id", orgIds);

  const paths = pathRows ?? [];
  const pathIds = paths.map((p) => p.id as string);

  const { data: enrollmentRows } =
    pathIds.length > 0
      ? await supabase
          .from("user_trainings")
          .select("training_path_id")
          .in("training_path_id", pathIds)
      : { data: [] as { training_path_id: string | null }[] };

  const countByPath = new Map<string, number>();
  for (const row of enrollmentRows ?? []) {
    const pid = row.training_path_id;
    if (pid) countByPath.set(pid, (countByPath.get(pid) ?? 0) + 1);
  }

  const combined: Omit<ManagerTopMaterialRow, "rank">[] = paths.map((p) => ({
    id: p.id as string,
    name: (p.name as string) || "—",
    studentCount: countByPath.get(p.id as string) ?? 0,
    lastUpdate: (p.updated_at as string) || "",
    href: `/dashboard/manager/training-paths/${p.id}`,
  }));

  combined.sort((a, b) => {
    if (b.studentCount !== a.studentCount) {
      return b.studentCount - a.studentCount;
    }
    const tb = new Date(b.lastUpdate).getTime();
    const ta = new Date(a.lastUpdate).getTime();
    if (tb !== ta) return tb - ta;
    return a.name.localeCompare(b.name);
  });

  return combined.slice(0, limit).map((row, i) => ({ ...row, rank: i + 1 }));
}

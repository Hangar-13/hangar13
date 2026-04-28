import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationRole, SystemRole } from "@/lib/auth-shared";
import { hasPlatformAdminAccess, normalizeSystemRole } from "@/lib/auth-shared";
import { hasOrgRoleAtLeast } from "@/lib/organization";

type PlatformOrOrgElevated = OrganizationRole | "god" | "admin";

/**
 * System `admin` or `god` OR org manager/admin in any organization (assignments, org admin UI).
 */
export async function assertManagerOrGodRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true; role: PlatformOrOrgElevated } | { ok: false }> {
  const { data: sys } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const r = normalizeSystemRole(sys?.role as string | undefined);
  if (hasPlatformAdminAccess(r)) {
    return { ok: true, role: r as "admin" | "god" };
  }

  const { data: row } = await supabase
    .from("user_organizations")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["manager", "admin"])
    .limit(1)
    .maybeSingle();

  if (!row?.role) {
    return { ok: false };
  }
  return { ok: true, role: row.role as OrganizationRole };
}

/** Mentor, manager, or admin in at least one org (catalog browser). */
export async function assertMentorOrAboveInAnyOrg(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false }> {
  const { data: row } = await supabase
    .from("user_organizations")
    .select("id")
    .eq("user_id", userId)
    .in("role", ["mentor", "manager", "admin"])
    .limit(1)
    .maybeSingle();

  return row ? { ok: true } : { ok: false };
}

export async function assertManagerOrGodInOrganization(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const { data: sys } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const r = normalizeSystemRole(sys?.role as string | undefined) as SystemRole;
  if (hasPlatformAdminAccess(r)) {
    return true;
  }

  return hasOrgRoleAtLeast(supabase, userId, organizationId, "manager");
}

export async function getTrainingPathOwnedByUser(
  supabase: SupabaseClient,
  trainingPathId: string,
  userId: string
) {
  const { data: path } = await supabase
    .from("training_paths")
    .select(
      "id, name, description, created_by, is_active, organization_id, visibility"
    )
    .eq("id", trainingPathId)
    .maybeSingle();

  if (!path?.organization_id) {
    return null;
  }

  const { data: sys } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (hasPlatformAdminAccess(normalizeSystemRole(sys?.role as string | undefined) as SystemRole)) {
    return path;
  }

  const canEdit = await hasOrgRoleAtLeast(
    supabase,
    userId,
    path.organization_id as string,
    "mentor"
  );
  if (!canEdit) {
    return null;
  }
  return path;
}

export async function getCourseOwnedByUser(
  supabase: SupabaseClient,
  courseId: string,
  userId: string
) {
  const { data: course } = await supabase
    .from("courses")
    .select("id, name, description, created_by, organization_id, visibility")
    .eq("id", courseId)
    .maybeSingle();

  if (!course?.organization_id) {
    return null;
  }

  const { data: sys } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (hasPlatformAdminAccess(normalizeSystemRole(sys?.role as string | undefined) as SystemRole)) {
    return course;
  }

  const canEdit = await hasOrgRoleAtLeast(
    supabase,
    userId,
    course.organization_id as string,
    "mentor"
  );
  if (!canEdit) {
    return null;
  }
  return course;
}

export async function getModuleInOwnedCourse(
  supabase: SupabaseClient,
  moduleId: string,
  userId: string
) {
  const { data: mod } = await supabase
    .from("modules")
    .select("id, course_id, title, description, number, is_hidden_from_users")
    .eq("id", moduleId)
    .maybeSingle();

  if (!mod) return null;

  const course = await getCourseOwnedByUser(supabase, mod.course_id, userId);
  if (!course) return null;

  return { module: mod, course };
}

export async function getLessonInOwnedCourse(
  supabase: SupabaseClient,
  lessonId: string,
  userId: string
) {
  const { data: lesson } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();

  if (!lesson) return null;

  const ctx = await getModuleInOwnedCourse(supabase, lesson.module_id, userId);
  if (!ctx) return null;

  return { lesson, module: ctx.module, course: ctx.course };
}

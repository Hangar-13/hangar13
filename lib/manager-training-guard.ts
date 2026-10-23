import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationRole, SystemRole } from "@/lib/auth-shared";
import { hasPlatformAdminAccess, normalizeSystemRole } from "@/lib/auth-shared";
import { hasOrgRoleAtLeast } from "@/lib/organization";

type PlatformOrOrgElevated = OrganizationRole | "god" | "admin";

/** Hangar `courses` row after manager access check (includes optional Talent LMS numeric course id). */
export type ManagerOwnedCourse = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  organization_id: string;
  visibility: string;
  talent_lms_course_id: string | null;
  is_deleted_lessons_archive?: boolean;
};

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
    .in("role", ["manager", "supervisor"])
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
    .in("role", ["mentor", "manager", "supervisor"])
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
): Promise<ManagerOwnedCourse | null> {
  const selectFull =
    "id, name, description, created_by, organization_id, visibility, talent_lms_course_id, is_deleted_lessons_archive";
  const selectWithTalent =
    "id, name, description, created_by, organization_id, visibility, talent_lms_course_id";
  const selectBase =
    "id, name, description, created_by, organization_id, visibility";

  const first = await supabase
    .from("courses")
    .select(selectFull)
    .eq("id", courseId)
    .maybeSingle();

  let course: Record<string, unknown> | null = first.data ?? null;

  // Until migration 101, `is_deleted_lessons_archive` does not exist.
  if (first.error && course === null) {
    const second = await supabase
      .from("courses")
      .select(selectWithTalent)
      .eq("id", courseId)
      .maybeSingle();
    course = second.data
      ? { ...second.data, is_deleted_lessons_archive: false }
      : null;
  }

  // Until migration 083 is applied, `talent_lms_course_id` does not exist — full select fails.
  if (course === null) {
    const third = await supabase
      .from("courses")
      .select(selectBase)
      .eq("id", courseId)
      .maybeSingle();
    course = third.data
      ? {
          ...third.data,
          talent_lms_course_id: null,
          is_deleted_lessons_archive: false,
        }
      : null;
  }

  if (!course?.organization_id) {
    return null;
  }

  const { data: sys } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (hasPlatformAdminAccess(normalizeSystemRole(sys?.role as string | undefined) as SystemRole)) {
    return course as ManagerOwnedCourse;
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
  return course as ManagerOwnedCourse;
}

export async function getModuleInOwnedCourse(
  supabase: SupabaseClient,
  moduleId: string,
  userId: string
) {
  const withSetup =
    "id, course_id, title, description, number, is_hidden_from_users, needs_setup";
  const withoutSetup =
    "id, course_id, title, description, number, is_hidden_from_users";

  const first = await supabase
    .from("modules")
    .select(withSetup)
    .eq("id", moduleId)
    .maybeSingle();

  let mod: Record<string, unknown> | null = first.data ?? null;
  if (first.error && mod === null) {
    const second = await supabase
      .from("modules")
      .select(withoutSetup)
      .eq("id", moduleId)
      .maybeSingle();
    mod = second.data ? { ...second.data, needs_setup: false } : null;
  }

  if (!mod) return null;

  const course = await getCourseOwnedByUser(
    supabase,
    mod.course_id as string,
    userId
  );
  if (!course) return null;

  return {
    module: mod as {
      id: string;
      course_id: string;
      title: string;
      description: string | null;
      number: number;
      is_hidden_from_users: boolean;
      needs_setup: boolean;
    },
    course,
  };
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

"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCourseOwnedByUser } from "@/lib/manager-training-guard";
import {
  formatCourseVersion,
  getLatestCourseVersion,
  listCourseVersions,
  type CourseVersionRow,
} from "@/lib/course-versions";

export type ManagerCourseVersionSummary = {
  id: string;
  majorVersion: number;
  minorVersion: number;
  label: string;
  releaseNotes: string | null;
  publishedAt: string;
  isLatest: boolean;
};

function toSummary(
  row: CourseVersionRow,
  latestId: string | null
): ManagerCourseVersionSummary {
  return {
    id: row.id,
    majorVersion: row.major_version,
    minorVersion: row.minor_version,
    label: formatCourseVersion(row.major_version, row.minor_version),
    releaseNotes: row.release_notes,
    publishedAt: row.published_at,
    isLatest: latestId === row.id,
  };
}

export async function managerListCourseVersions(
  courseId: string
): Promise<
  { ok: true; versions: ManagerCourseVersionSummary[] } | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const course = await getCourseOwnedByUser(supabase, courseId, user.id);
  if (!course) return { ok: false, error: "Course not found." };

  const rows = await listCourseVersions(supabase, courseId);
  const latest = rows[0]?.id ?? null;
  return { ok: true, versions: rows.map((r) => toSummary(r, latest)) };
}

export async function managerPublishCourseVersion(input: {
  courseId: string;
  bump: "major" | "minor";
  releaseNotes?: string;
}): Promise<{ ok: true; version: ManagerCourseVersionSummary } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const course = await getCourseOwnedByUser(supabase, input.courseId, user.id);
  if (!course) return { ok: false, error: "Course not found." };

  const latest = await getLatestCourseVersion(supabase, input.courseId);
  let major = 1;
  let minor = 0;
  if (latest) {
    if (input.bump === "major") {
      major = latest.major_version + 1;
      minor = 0;
    } else {
      major = latest.major_version;
      minor = latest.minor_version + 1;
    }
  }

  const { data: versionRow, error: versionErr } = await supabase
    .from("course_versions")
    .insert({
      course_id: input.courseId,
      major_version: major,
      minor_version: minor,
      release_notes: input.releaseNotes?.trim() || null,
      published_by: user.id,
    })
    .select("id, course_id, major_version, minor_version, release_notes, published_at, published_by")
    .single();

  if (versionErr || !versionRow) {
    return { ok: false, error: versionErr?.message ?? "Could not publish version." };
  }

  const { data: modules } = await supabase
    .from("modules")
    .select("id, number, title, description, is_hidden_from_users")
    .eq("course_id", input.courseId)
    .order("number", { ascending: true });

  for (const mod of modules ?? []) {
    const { data: snapMod, error: modErr } = await supabase
      .from("course_version_modules")
      .insert({
        course_version_id: versionRow.id,
        source_module_id: mod.id,
        number: mod.number,
        title: mod.title,
        description: mod.description,
        is_hidden_from_users: mod.is_hidden_from_users ?? false,
      })
      .select("id")
      .single();

    if (modErr || !snapMod) {
      return { ok: false, error: modErr?.message ?? "Could not snapshot modules." };
    }

    const { data: lessons } = await supabase
      .from("lessons")
      .select(
        "id, number, title, ata_chapter, learning_objectives, study_materials, practical_application, mentor_discussion_questions, weekly_deliverable, hours, acs_codes, ata_chapter_ids, talent_lms_unit_id"
      )
      .eq("module_id", mod.id)
      .order("number", { ascending: true });

    if (lessons?.length) {
      const { error: lesErr } = await supabase.from("course_version_lessons").insert(
        lessons.map((l) => ({
          course_version_module_id: snapMod.id,
          source_lesson_id: l.id,
          number: l.number,
          title: l.title,
          ata_chapter: l.ata_chapter,
          learning_objectives: l.learning_objectives,
          study_materials: l.study_materials,
          practical_application: l.practical_application,
          mentor_discussion_questions: l.mentor_discussion_questions,
          weekly_deliverable: l.weekly_deliverable,
          hours: l.hours ?? 0,
          acs_codes: l.acs_codes,
          ata_chapter_ids: l.ata_chapter_ids,
          talent_lms_unit_id: l.talent_lms_unit_id,
        }))
      );
      if (lesErr) {
        return { ok: false, error: lesErr.message };
      }
    }
  }

  revalidatePath(`/dashboard/manager/courses/${input.courseId}`);
  revalidatePath("/dashboard/manager/content");

  const version = versionRow as CourseVersionRow;
  return {
    ok: true,
    version: toSummary(version, version.id),
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  getCourseOwnedByUser,
  getLessonInOwnedCourse,
  getModuleInOwnedCourse,
} from "@/lib/manager-training-guard";
import {
  isCatalogVisibility,
  type CatalogVisibility,
} from "@/lib/catalog-visibility";

function linesToTextArray(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNonNegativeLessonHours(
  value: unknown
): { ok: true; hours: number } | { ok: false; error: string } {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99999) {
    return { ok: false, error: "Hours must be between 0 and 99999." };
  }
  return { ok: true, hours: Math.round(n * 100) / 100 };
}

function normalizeStringListField(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value
      .map((s) => (typeof s === "string" ? s : String(s)).trim())
      .filter(Boolean);
  }
  return linesToTextArray(value);
}

/** Server actions may deserialize JSON with numeric ids as strings. */
function coerceStrictPositiveIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const x of value) {
    if (typeof x === "number" && Number.isInteger(x) && x > 0) {
      out.push(x);
      continue;
    }
    if (typeof x === "string" && x.trim() !== "") {
      const n = Number.parseInt(x, 10);
      if (Number.isInteger(n) && n > 0) out.push(n);
    }
  }
  return out;
}

async function orderPreservingValidAcsCodeIds(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  requested: number[]
): Promise<number[]> {
  if (requested.length === 0) return [];
  const unique = [...new Set(requested)];
  const { data } = await supabase.from("acs_code").select("id").in("id", unique);
  const valid = new Set((data ?? []).map((r) => (r as { id: number }).id));
  return requested.filter((id) => valid.has(id));
}

async function orderPreservingValidAtaChapterIds(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  requested: number[]
): Promise<number[]> {
  if (requested.length === 0) return [];
  const unique = [...new Set(requested)];
  const { data } = await supabase.from("ata_chapter").select("id").in("id", unique);
  const valid = new Set((data ?? []).map((r) => (r as { id: number }).id));
  return requested.filter((id) => valid.has(id));
}

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateCourseFields(
  courseId: string,
  patch: {
    name?: string;
    description?: string | null;
    visibility?: CatalogVisibility;
  }
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const course = await getCourseOwnedByUser(supabase, courseId, user.id);
  if (!course) return { ok: false, error: "Course not found." };

  const update: Record<string, string | null> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "Title cannot be empty." };
    update.name = n;
  }
  if (patch.description !== undefined) {
    update.description = patch.description?.trim() || null;
  }
  if (patch.visibility !== undefined) {
    if (!isCatalogVisibility(patch.visibility)) {
      return { ok: false, error: "Invalid visibility." };
    }
    update.visibility = patch.visibility;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("courses").update(update).eq("id", courseId);
  if (error) {
    console.error("updateCourseFields", error);
    return { ok: false, error: "Could not save." };
  }

  revalidatePath(`/dashboard/manager/courses/${courseId}`);
  revalidatePath("/dashboard/manager/content");
  return { ok: true };
}

export async function createManagerModule(input: {
  courseId: string;
  title: string;
  description: string | null;
  isHiddenFromUsers: boolean;
}): Promise<{ ok: true; moduleId: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const course = await getCourseOwnedByUser(supabase, input.courseId, user.id);
  if (!course) return { ok: false, error: "Course not found." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const { data: existing } = await supabase
    .from("modules")
    .select("number")
    .eq("course_id", input.courseId)
    .order("number", { ascending: false })
    .limit(1);

  const nextOrder =
    existing && existing.length > 0 ? (existing[0].number ?? 0) + 1 : 0;

  const { data: row, error } = await supabase
    .from("modules")
    .insert({
      course_id: input.courseId,
      title,
      description: input.description?.trim() || null,
      number: nextOrder,
      is_hidden_from_users: input.isHiddenFromUsers,
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error("createManagerModule", error);
    return { ok: false, error: "Could not create module." };
  }

  revalidatePath(`/dashboard/manager/courses/${input.courseId}`);
  return { ok: true, moduleId: row.id };
}

export async function updateModuleFields(
  moduleId: string,
  patch: {
    title?: string;
    description?: string | null;
  }
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getModuleInOwnedCourse(supabase, moduleId, user.id);
  if (!ctx) return { ok: false, error: "Module not found." };

  const update: Record<string, string | null> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty." };
    update.title = t;
  }
  if (patch.description !== undefined) {
    update.description = patch.description?.trim() || null;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("modules").update(update).eq("id", moduleId);
  if (error) {
    console.error("updateModuleFields", error);
    return { ok: false, error: "Could not save." };
  }

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}/modules/${moduleId}`);
  return { ok: true };
}

/**
 * Only allowed when the course has exactly one module. Sets default placeholder title,
 * clears description, and hides the module shell from learners.
 */
export async function convertSoleModuleToDefaultModule(
  moduleId: string
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getModuleInOwnedCourse(supabase, moduleId, user.id);
  if (!ctx) return { ok: false, error: "Module not found." };

  const { count, error: countError } = await supabase
    .from("modules")
    .select("*", { count: "exact", head: true })
    .eq("course_id", ctx.module.course_id);

  if (countError) {
    console.error("convertSoleModuleToDefaultModule count", countError);
    return { ok: false, error: "Could not verify course modules." };
  }
  if (count !== 1) {
    return {
      ok: false,
      error: "This action is only available when the course has a single module.",
    };
  }

  const title = `${ctx.course.name} module`;

  const { error } = await supabase
    .from("modules")
    .update({
      title,
      description: null,
      is_hidden_from_users: true,
    })
    .eq("id", moduleId);

  if (error) {
    console.error("convertSoleModuleToDefaultModule", error);
    return { ok: false, error: "Could not update module." };
  }

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}/modules/${moduleId}`);
  return { ok: true };
}

export async function reorderCourseModules(
  courseId: string,
  orderedModuleIds: string[]
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const course = await getCourseOwnedByUser(supabase, courseId, user.id);
  if (!course) return { ok: false, error: "Course not found." };

  const { data: rows } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId);

  const existing = new Set((rows ?? []).map((r) => r.id));
  if (orderedModuleIds.length !== existing.size) {
    return { ok: false, error: "Module list does not match this course." };
  }
  for (const id of orderedModuleIds) {
    if (!existing.has(id)) {
      return { ok: false, error: "Invalid module in order." };
    }
  }

  if (orderedModuleIds.length > 0) {
    for (let i = 0; i < orderedModuleIds.length; i++) {
      const { error } = await supabase
        .from("modules")
        .update({ number: i })
        .eq("id", orderedModuleIds[i])
        .eq("course_id", courseId);
      if (error) {
        console.error("reorderCourseModules", error);
        return { ok: false, error: "Could not save module order." };
      }
    }
  }

  revalidatePath(`/dashboard/manager/courses/${courseId}`);
  for (const id of orderedModuleIds) {
    revalidatePath(`/dashboard/manager/courses/${courseId}/modules/${id}`);
  }
  return { ok: true };
}

export async function deleteManagerModule(
  moduleId: string
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getModuleInOwnedCourse(supabase, moduleId, user.id);
  if (!ctx) return { ok: false, error: "Module not found." };

  const { error } = await supabase.from("modules").delete().eq("id", moduleId);
  if (error) {
    console.error("deleteManagerModule", error);
    return { ok: false, error: "Could not delete module." };
  }

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath(`/dashboard/manager/content`);
  return { ok: true };
}

export async function deleteManagerLesson(lessonId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getLessonInOwnedCourse(supabase, lessonId, user.id);
  if (!ctx) return { ok: false, error: "Lesson not found." };

  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) {
    console.error("deleteManagerLesson", error);
    return { ok: false, error: "Could not delete lesson." };
  }

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath(
    `/dashboard/manager/courses/${ctx.course.id}/modules/${ctx.module.id}`
  );
  revalidatePath(`/dashboard/manager/content`);
  return { ok: true };
}

const LESSON_REORDER_TEMP_BASE = 1_000_000;

export async function reorderModuleLessons(
  moduleId: string,
  orderedLessonIds: string[]
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getModuleInOwnedCourse(supabase, moduleId, user.id);
  if (!ctx) return { ok: false, error: "Module not found." };

  const { data: lessonRows } = await supabase
    .from("lessons")
    .select("id")
    .eq("module_id", moduleId);

  const existing = new Set((lessonRows ?? []).map((r) => r.id));
  if (orderedLessonIds.length !== existing.size) {
    return { ok: false, error: "Lesson list does not match this module." };
  }
  for (const id of orderedLessonIds) {
    if (!existing.has(id)) {
      return { ok: false, error: "Invalid lesson in order." };
    }
  }

  if (orderedLessonIds.length > 0) {
    for (let i = 0; i < orderedLessonIds.length; i++) {
      const { error } = await supabase
        .from("lessons")
        .update({ number: LESSON_REORDER_TEMP_BASE + i })
        .eq("id", orderedLessonIds[i])
        .eq("module_id", moduleId);
      if (error) {
        console.error("reorderModuleLessons phase1", error);
        return { ok: false, error: "Could not update lesson order." };
      }
    }
    for (let i = 0; i < orderedLessonIds.length; i++) {
      const { error } = await supabase
        .from("lessons")
        .update({ number: i + 1 })
        .eq("id", orderedLessonIds[i])
        .eq("module_id", moduleId);
      if (error) {
        console.error("reorderModuleLessons phase2", error);
        return { ok: false, error: "Could not finalize lesson order." };
      }
    }
  }

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath(
    `/dashboard/manager/courses/${ctx.course.id}/modules/${moduleId}`
  );
  for (const id of orderedLessonIds) {
    revalidatePath(
      `/dashboard/manager/courses/${ctx.course.id}/modules/${moduleId}/lessons/${id}`
    );
  }
  return { ok: true };
}

export async function createManagerLesson(input: {
  moduleId: string;
  weekNumber: number;
  title: string;
  hours?: number;
  ataChapterIds: number[];
  acsCodes?: number[];
  learningObjectives: string | string[];
  studyMaterials: string | null;
  practicalApplication: string | null;
  mentorDiscussionQuestions: string | string[];
  weeklyDeliverable: string | null;
}): Promise<{ ok: true; lessonId: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getModuleInOwnedCourse(supabase, input.moduleId, user.id);
  if (!ctx) return { ok: false, error: "Module not found." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const hoursParsed = parseNonNegativeLessonHours(input.hours ?? 0);
  if (!hoursParsed.ok) return hoursParsed;

  if (!Number.isInteger(input.weekNumber) || input.weekNumber < 1) {
    return { ok: false, error: "Lesson number must be a positive integer." };
  }

  const acsCodes = await orderPreservingValidAcsCodeIds(
    supabase,
    coerceStrictPositiveIntArray(input.acsCodes)
  );
  const ataChapterIds = await orderPreservingValidAtaChapterIds(
    supabase,
    coerceStrictPositiveIntArray(input.ataChapterIds)
  );

  const { data: row, error } = await supabase
    .from("lessons")
    .insert({
      module_id: input.moduleId,
      number: input.weekNumber,
      title,
      ata_chapter: null,
      ata_chapter_ids: ataChapterIds,
      acs_codes: acsCodes,
      learning_objectives: normalizeStringListField(
        input.learningObjectives
      ),
      study_materials: input.studyMaterials?.trim() || null,
      practical_application: input.practicalApplication?.trim() || null,
      mentor_discussion_questions: normalizeStringListField(
        input.mentorDiscussionQuestions
      ),
      weekly_deliverable: input.weeklyDeliverable?.trim() || null,
      hours: hoursParsed.hours,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That lesson number is already used in this module.",
      };
    }
    console.error("createManagerLesson", error);
    return { ok: false, error: "Could not create lesson." };
  }

  if (!row) return { ok: false, error: "Could not create lesson." };

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}/modules/${input.moduleId}`);
  return { ok: true, lessonId: row.id };
}

export async function updateLessonFields(
  lessonId: string,
  patch: {
    number?: number;
    title?: string;
    hours?: number;
    ata_chapter_ids?: number[];
    acs_codes?: number[];
    learning_objectives?: string | string[];
    study_materials?: string | null;
    practical_application?: string | null;
    mentor_discussion_questions?: string | string[];
    weekly_deliverable?: string | null;
  }
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getLessonInOwnedCourse(supabase, lessonId, user.id);
  if (!ctx) return { ok: false, error: "Lesson not found." };

  const update: Record<
    string,
    string | number | string[] | number[] | null
  > = {};

  if (patch.number !== undefined) {
    if (!Number.isInteger(patch.number) || patch.number < 1) {
      return { ok: false, error: "Lesson number must be a positive integer." };
    }
    update.number = patch.number;
  }
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty." };
    update.title = t;
  }
  if (patch.hours !== undefined) {
    const hp = parseNonNegativeLessonHours(patch.hours);
    if (!hp.ok) return hp;
    update.hours = hp.hours;
  }
  if (patch.ata_chapter_ids !== undefined) {
    update.ata_chapter_ids = await orderPreservingValidAtaChapterIds(
      supabase,
      coerceStrictPositiveIntArray(patch.ata_chapter_ids)
    );
  }
  if (patch.acs_codes !== undefined) {
    update.acs_codes = await orderPreservingValidAcsCodeIds(
      supabase,
      coerceStrictPositiveIntArray(patch.acs_codes)
    );
  }
  if (patch.learning_objectives !== undefined) {
    update.learning_objectives = normalizeStringListField(
      patch.learning_objectives
    );
  }
  if (patch.study_materials !== undefined) {
    update.study_materials = patch.study_materials?.trim() || null;
  }
  if (patch.practical_application !== undefined) {
    update.practical_application = patch.practical_application?.trim() || null;
  }
  if (patch.mentor_discussion_questions !== undefined) {
    update.mentor_discussion_questions = normalizeStringListField(
      patch.mentor_discussion_questions
    );
  }
  if (patch.weekly_deliverable !== undefined) {
    update.weekly_deliverable = patch.weekly_deliverable?.trim() || null;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("lessons").update(update).eq("id", lessonId);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That lesson number is already used in this module.",
      };
    }
    console.error("updateLessonFields", error);
    if (error.message) {
      return { ok: false, error: `Could not save: ${error.message}` };
    }
    return { ok: false, error: "Could not save." };
  }

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath(
    `/dashboard/manager/courses/${ctx.course.id}/modules/${ctx.module.id}`
  );
  revalidatePath(
    `/dashboard/manager/courses/${ctx.course.id}/modules/${ctx.module.id}/lessons/${lessonId}`
  );
  return { ok: true };
}

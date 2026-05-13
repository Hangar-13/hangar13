"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  assertManagerOrGodInOrganization,
  assertMentorOrAboveInAnyOrg,
  getTrainingPathOwnedByUser,
} from "@/lib/manager-training-guard";
import {
  buildTrainingContentCatalog,
  type TrainingContentCatalogCourse,
} from "@/lib/manager-training-catalog";
import { resolveOrganizationIdForCreatedContent } from "@/lib/organization";
import {
  isCatalogVisibility,
  type CatalogVisibility,
} from "@/lib/catalog-visibility";

export type {
  TrainingContentCatalogCourse,
  TrainingContentCatalogLesson,
  TrainingContentCatalogModule,
} from "@/lib/manager-training-catalog";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function loadTrainingContentCatalog(): Promise<
  | { ok: true; courses: TrainingContentCatalogCourse[] }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const roleOk = await assertMentorOrAboveInAnyOrg(supabase, user.id);
  if (!roleOk.ok) return { ok: false, error: "Forbidden." };

  const tree = await buildTrainingContentCatalog(supabase, user.id);
  return { ok: true, courses: tree };
}

export async function createManagerTrainingPath(input: {
  title: string;
  description: string;
}): Promise<
  { ok: true; trainingPathId: string } | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const name = input.title.trim();
  if (!name) return { ok: false, error: "Title is required." };

  const organizationId = await resolveOrganizationIdForCreatedContent(
    supabase,
    user.id
  );
  if (!organizationId) {
    return {
      ok: false,
      error: "No organization exists to attach this training path to.",
    };
  }

  const canCreate = await assertManagerOrGodInOrganization(
    supabase,
    user.id,
    organizationId
  );
  if (!canCreate) {
    return {
      ok: false,
      error: "You do not have permission to create training paths for this organization.",
    };
  }

  const { data: row, error } = await supabase
    .from("training_paths")
    .insert({
      name,
      description: input.description.trim() || null,
      created_by: user.id,
      organization_id: organizationId,
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error("createManagerTrainingPath", error);
    return { ok: false, error: "Could not create training path." };
  }

  revalidatePath("/dashboard/manager/content");
  return { ok: true, trainingPathId: row.id };
}

export async function updateTrainingPathFields(
  trainingPathId: string,
  patch: {
    name?: string;
    description?: string | null;
    visibility?: CatalogVisibility;
    /** Talent LMS numeric course id; empty string clears. */
    talentLmsCourseId?: string | null;
  }
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const path = await getTrainingPathOwnedByUser(
    supabase,
    trainingPathId,
    user.id
  );
  if (!path) return { ok: false, error: "Training path not found." };

  const update: Record<string, string | null> = {};
  if (patch.talentLmsCourseId !== undefined) {
    const raw = patch.talentLmsCourseId?.trim() ?? "";
    if (raw === "") {
      update.talent_lms_course_id = null;
    } else if (!/^\d+$/.test(raw)) {
      return {
        ok: false,
        error:
          "TalentLMS course ID must be numeric (digits only), e.g. 126.",
      };
    } else {
      update.talent_lms_course_id = raw;
    }
  }
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

  const { error } = await supabase
    .from("training_paths")
    .update(update)
    .eq("id", trainingPathId);

  if (error) {
    console.error("updateTrainingPathFields", error);
    return { ok: false, error: "Could not save." };
  }

  revalidatePath("/dashboard/manager/content");
  revalidatePath(`/dashboard/manager/training-paths/${trainingPathId}`);
  return { ok: true };
}

export type TrainingPathPick =
  | { kind: "course"; id: string }
  | { kind: "module"; id: string }
  | { kind: "lesson"; id: string };

function itemKey(
  row: Pick<
    { course_id: string | null; module_id: string | null; lesson_id: string | null },
    "course_id" | "module_id" | "lesson_id"
  >
): string | null {
  if (row.course_id) return `c:${row.course_id}`;
  if (row.module_id) return `m:${row.module_id}`;
  if (row.lesson_id) return `l:${row.lesson_id}`;
  return null;
}

export async function addTrainingPathItems(
  trainingPathId: string,
  picks: TrainingPathPick[]
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const path = await getTrainingPathOwnedByUser(
    supabase,
    trainingPathId,
    user.id
  );
  if (!path) return { ok: false, error: "Training path not found." };

  const pathOrgId = path.organization_id as string;

  const { data: ownedCourses } = await supabase
    .from("courses")
    .select("id")
    .eq("organization_id", pathOrgId)
    .in("visibility", ["proprietary", "public"] as const);
  const allowedCourseIds = new Set(
    (ownedCourses ?? []).map((c) => c.id)
  );
  const courseIdList = [...allowedCourseIds];
  const { data: ownedModules } =
    courseIdList.length > 0
      ? await supabase
          .from("modules")
          .select("id")
          .in("course_id", courseIdList)
      : { data: [] as { id: string }[] };
  const allowedModuleIds = new Set(
    (ownedModules ?? []).map((m) => m.id)
  );
  const moduleIdList = [...allowedModuleIds];
  const { data: ownedLessons } =
    moduleIdList.length > 0
      ? await supabase.from("lessons").select("id").in("module_id", moduleIdList)
      : { data: [] as { id: string }[] };
  const allowedLessonIds = new Set(
    (ownedLessons ?? []).map((l) => l.id)
  );

  for (const p of picks) {
    if (p.kind === "course" && !allowedCourseIds.has(p.id)) {
      return { ok: false, error: "One or more selections are not in your catalog." };
    }
    if (p.kind === "module" && !allowedModuleIds.has(p.id)) {
      return { ok: false, error: "One or more selections are not in your catalog." };
    }
    if (p.kind === "lesson" && !allowedLessonIds.has(p.id)) {
      return { ok: false, error: "One or more selections are not in your catalog." };
    }
  }

  const { data: existing } = await supabase
    .from("training_path_items")
    .select("sort_order, course_id, module_id, lesson_id")
    .eq("training_path_id", trainingPathId);

  const usedKeys = new Set(
    (existing ?? [])
      .map((r) => itemKey(r))
      .filter((k): k is string => k != null)
  );

  let nextOrder =
    existing && existing.length > 0
      ? Math.max(...existing.map((r) => r.sort_order ?? 0)) + 1
      : 0;

  const inserts: Array<{
    training_path_id: string;
    sort_order: number;
    course_id: string | null;
    module_id: string | null;
    lesson_id: string | null;
  }> = [];

  for (const p of picks) {
    const key =
      p.kind === "course"
        ? `c:${p.id}`
        : p.kind === "module"
          ? `m:${p.id}`
          : `l:${p.id}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    inserts.push({
      training_path_id: trainingPathId,
      sort_order: nextOrder++,
      course_id: p.kind === "course" ? p.id : null,
      module_id: p.kind === "module" ? p.id : null,
      lesson_id: p.kind === "lesson" ? p.id : null,
    });
  }

  if (inserts.length === 0) return { ok: true };

  const { error } = await supabase.from("training_path_items").insert(inserts);
  if (error) {
    console.error("addTrainingPathItems", error);
    return { ok: false, error: "Could not add content." };
  }

  revalidatePath(`/dashboard/manager/training-paths/${trainingPathId}`);
  return { ok: true };
}

const PATH_ITEM_REORDER_TEMP_BASE = 1_000_000;

export async function reorderTrainingPathItems(
  trainingPathId: string,
  orderedItemIds: string[]
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const path = await getTrainingPathOwnedByUser(
    supabase,
    trainingPathId,
    user.id
  );
  if (!path) return { ok: false, error: "Training path not found." };

  const { data: rows } = await supabase
    .from("training_path_items")
    .select("id")
    .eq("training_path_id", trainingPathId);

  const existing = new Set((rows ?? []).map((r) => r.id));
  if (orderedItemIds.length !== existing.size) {
    return { ok: false, error: "Item list does not match this training path." };
  }
  for (const id of orderedItemIds) {
    if (!existing.has(id)) {
      return { ok: false, error: "Invalid item in order." };
    }
  }

  if (orderedItemIds.length > 0) {
    for (let i = 0; i < orderedItemIds.length; i++) {
      const { error } = await supabase
        .from("training_path_items")
        .update({ sort_order: PATH_ITEM_REORDER_TEMP_BASE + i })
        .eq("id", orderedItemIds[i])
        .eq("training_path_id", trainingPathId);
      if (error) {
        console.error("reorderTrainingPathItems phase1", error);
        return { ok: false, error: "Could not update order." };
      }
    }
    for (let i = 0; i < orderedItemIds.length; i++) {
      const { error } = await supabase
        .from("training_path_items")
        .update({ sort_order: i })
        .eq("id", orderedItemIds[i])
        .eq("training_path_id", trainingPathId);
      if (error) {
        console.error("reorderTrainingPathItems phase2", error);
        return { ok: false, error: "Could not finalize order." };
      }
    }
  }

  revalidatePath(`/dashboard/manager/training-paths/${trainingPathId}`);
  revalidatePath("/dashboard/manager/content");
  return { ok: true };
}

export async function deleteTrainingPathItemRows(
  trainingPathId: string,
  itemRowIds: string[]
): Promise<ActionResult> {
  if (itemRowIds.length === 0) return { ok: true };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const path = await getTrainingPathOwnedByUser(
    supabase,
    trainingPathId,
    user.id
  );
  if (!path) return { ok: false, error: "Training path not found." };

  const { data: valid } = await supabase
    .from("training_path_items")
    .select("id")
    .eq("training_path_id", trainingPathId)
    .in("id", itemRowIds);

  const found = new Set((valid ?? []).map((r) => r.id));
  for (const id of itemRowIds) {
    if (!found.has(id)) {
      return { ok: false, error: "Invalid path item to delete." };
    }
  }

  const { error } = await supabase
    .from("training_path_items")
    .delete()
    .eq("training_path_id", trainingPathId)
    .in("id", itemRowIds);
  if (error) {
    console.error("deleteTrainingPathItemRows", error);
    return { ok: false, error: "Could not remove from training path." };
  }

  revalidatePath(`/dashboard/manager/training-paths/${trainingPathId}`);
  revalidatePath("/dashboard/manager/content");
  return { ok: true };
}

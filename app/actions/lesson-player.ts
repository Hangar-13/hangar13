"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLessonInOwnedCourse } from "@/lib/manager-training-guard";
import {
  clearLessonPackage,
  getLessonPlayerProgress,
  replaceLessonPackage,
  type LessonPackageKind,
  type LessonPlayerProgress,
} from "@/lib/lesson-player";

function parseKind(kind: string): LessonPackageKind | null {
  return kind === "content" || kind === "test" ? kind : null;
}

export async function uploadLessonPackage(
  lessonId: string,
  kind: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const slot = parseKind(kind);
  if (!slot) return { ok: false, error: "Unknown package slot." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getLessonInOwnedCourse(supabase, lessonId, user.id);
  if (!ctx) return { ok: false, error: "Lesson not found." };

  const file = formData.get("package");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a SCORM zip file." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await replaceLessonPackage(supabase, {
    lessonId,
    kind: slot,
    filename: file.name || "package.zip",
    bytes,
    uploadedBy: user.id,
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath("/dashboard/student/training");
  return { ok: true };
}

export async function clearLessonPackageAction(
  lessonId: string,
  kind: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const slot = parseKind(kind);
  if (!slot) return { ok: false, error: "Unknown package slot." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await getLessonInOwnedCourse(supabase, lessonId, user.id);
  if (!ctx) return { ok: false, error: "Lesson not found." };

  const result = await clearLessonPackage(supabase, { lessonId, kind: slot });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/manager/courses/${ctx.course.id}`);
  revalidatePath("/dashboard/student/training");
  return { ok: true };
}

export async function refreshLessonPlayerProgress(options: {
  lessonId: string;
  kind: LessonPackageKind;
  courseVersionId: string | null;
  returnPath: string | null;
}): Promise<LessonPlayerProgress | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  return getLessonPlayerProgress(supabase, {
    lessonId: options.lessonId,
    userId: user.id,
    kind: options.kind,
    courseVersionId: options.courseVersionId,
    returnPath: options.returnPath,
  });
}

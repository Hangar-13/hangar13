import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import type { LessonPackageKind, LessonPackageSlots, LessonPackageSummary } from "@/lib/lesson-player/types";
import { parseScormZip } from "@/lib/lesson-player/scorm/parse-package";

export const LESSON_PACKAGE_BUCKET = "lesson-packages";
const MAX_ZIP_BYTES = 40 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

export function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function summaryFromRow(row: Record<string, unknown>, kind: LessonPackageKind): LessonPackageSummary {
  return {
    id: String(row.id),
    kind,
    title: String(row.title ?? ""),
    schemaVersion: String(row.schema_version ?? ""),
    masteryScore:
      row.mastery_score == null || !Number.isFinite(Number(row.mastery_score))
        ? null
        : Number(row.mastery_score),
    originalFilename:
      typeof row.original_filename === "string" ? row.original_filename : null,
    scoCount: Number(row.sco_count ?? 1),
    uploadedAt: String(row.created_at ?? ""),
  };
}

export async function listLessonPackages(
  supabase: SupabaseClient,
  lessonId: string
): Promise<LessonPackageSlots> {
  const { data: lesson } = await supabase
    .from("lessons")
    .select("content_package_id, test_package_id")
    .eq("id", lessonId)
    .maybeSingle();

  async function load(id: unknown, kind: LessonPackageKind): Promise<LessonPackageSummary | null> {
    if (typeof id !== "string" || !id) return null;
    const { data } = await supabase
      .from("lesson_packages")
      .select("id, title, schema_version, mastery_score, original_filename, sco_count, created_at")
      .eq("id", id)
      .maybeSingle();
    return data ? summaryFromRow(data as Record<string, unknown>, kind) : null;
  }

  const [content, test] = await Promise.all([
    load(lesson?.content_package_id, "content"),
    load(lesson?.test_package_id, "test"),
  ]);
  return { content, test };
}

async function removeStoredObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const admin = createAdminSupabaseClient();
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    await admin.storage.from(LESSON_PACKAGE_BUCKET).remove(chunk);
  }
}

async function packageIsReferenced(
  supabase: SupabaseClient,
  packageId: string
): Promise<boolean> {
  const [live, versioned] = await Promise.all([
    supabase
      .from("lessons")
      .select("id")
      .or(`content_package_id.eq.${packageId},test_package_id.eq.${packageId}`)
      .limit(1),
    supabase
      .from("course_version_lessons")
      .select("id")
      .or(`content_package_id.eq.${packageId},test_package_id.eq.${packageId}`)
      .limit(1),
  ]);
  return (live.data?.length ?? 0) > 0 || (versioned.data?.length ?? 0) > 0;
}

export async function replaceLessonPackage(
  supabase: SupabaseClient,
  options: {
    lessonId: string;
    kind: LessonPackageKind;
    filename: string;
    bytes: Uint8Array;
    uploadedBy: string;
  }
): Promise<{ ok: true; summary: LessonPackageSummary } | { ok: false; error: string }> {
  if (options.bytes.byteLength === 0) {
    return { ok: false, error: "Choose a SCORM zip file." };
  }
  if (options.bytes.byteLength > MAX_ZIP_BYTES) {
    return { ok: false, error: "The zip must be 40 MB or smaller." };
  }

  let parsed;
  try {
    parsed = parseScormZip(options.bytes);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not read that SCORM package.",
    };
  }

  const column = options.kind === "test" ? "test_package_id" : "content_package_id";
  const { data: existingLesson } = await supabase
    .from("lessons")
    .select("content_package_id, test_package_id, courseware_revision")
    .eq("id", options.lessonId)
    .maybeSingle();
  const previousRaw = existingLesson?.[column];
  const previousId = typeof previousRaw === "string" ? previousRaw : null;
  const previousRevision = Number(existingLesson?.courseware_revision ?? 0);
  const nextRevision =
    options.kind === "content" ? Math.max(1, previousRevision + 1) : null;

  const packageId = crypto.randomUUID();
  const objectPaths: string[] = [];
  const admin = createAdminSupabaseClient();

  try {
    for (const [rel, data] of Object.entries(parsed.files)) {
      const objectPath = `${packageId}/${rel}`;
      const { error } = await admin.storage
        .from(LESSON_PACKAGE_BUCKET)
        .upload(objectPath, data, {
          contentType: contentTypeForPath(rel),
          upsert: false,
        });
      if (error) {
        throw new Error(error.message);
      }
      objectPaths.push(objectPath);
    }

    const { error: insertError } = await supabase.from("lesson_packages").insert({
      id: packageId,
      lesson_id: options.lessonId,
      kind: options.kind,
      title: parsed.title,
      schema_version: parsed.schemaVersion,
      mastery_score: parsed.masteryScore,
      launch_path: parsed.launchPath,
      original_filename: options.filename,
      sco_count: parsed.scoCount,
      object_paths: objectPaths,
      uploaded_by: options.uploadedBy,
    });
    if (insertError) throw new Error(insertError.message);

    if (options.kind === "content" && previousId && previousRevision > 0) {
      const { error: stampError } = await supabase
        .from("lesson_player_attempts")
        .update({
          lesson_id: options.lessonId,
          courseware_revision: previousRevision,
        })
        .eq("package_id", previousId);
      if (stampError) throw new Error(stampError.message);
    }

    const { error: pointError } = await supabase
      .from("lessons")
      .update({
        [column]: packageId,
        ...(nextRevision != null ? { courseware_revision: nextRevision } : {}),
      })
      .eq("id", options.lessonId);
    if (pointError) throw new Error(pointError.message);
  } catch (e) {
    await removeStoredObjects(objectPaths);
    await supabase.from("lesson_packages").delete().eq("id", packageId);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not store the package.",
    };
  }

  if (previousId && previousId !== packageId) {
    const stillUsed = await packageIsReferenced(supabase, previousId);
    if (!stillUsed) {
      const { data: old } = await supabase
        .from("lesson_packages")
        .select("object_paths")
        .eq("id", previousId)
        .maybeSingle();
      const paths = Array.isArray(old?.object_paths)
        ? old.object_paths.filter((p): p is string => typeof p === "string")
        : [];
      await supabase.from("lesson_packages").delete().eq("id", previousId);
      await removeStoredObjects(paths);
    }
  }

  return {
    ok: true,
    summary: {
      id: packageId,
      kind: options.kind,
      title: parsed.title,
      schemaVersion: parsed.schemaVersion,
      masteryScore: parsed.masteryScore,
      originalFilename: options.filename,
      scoCount: parsed.scoCount,
      uploadedAt: new Date().toISOString(),
    },
  };
}

export async function clearLessonPackage(
  supabase: SupabaseClient,
  options: { lessonId: string; kind: LessonPackageKind }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const column = options.kind === "test" ? "test_package_id" : "content_package_id";
  const { data: lesson, error: readError } = await supabase
    .from("lessons")
    .select("content_package_id, test_package_id")
    .eq("id", options.lessonId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  const packageRaw = lesson?.[column];
  const packageId = typeof packageRaw === "string" ? packageRaw : null;
  if (typeof packageId !== "string" || !packageId) return { ok: true };

  const { error: updateError } = await supabase
    .from("lessons")
    .update({ [column]: null })
    .eq("id", options.lessonId);
  if (updateError) return { ok: false, error: updateError.message };

  const stillUsed = await packageIsReferenced(supabase, packageId);
  if (!stillUsed) {
    const { data: old } = await supabase
      .from("lesson_packages")
      .select("object_paths")
      .eq("id", packageId)
      .maybeSingle();
    const paths = Array.isArray(old?.object_paths)
      ? old.object_paths.filter((p): p is string => typeof p === "string")
      : [];
    await supabase.from("lesson_packages").delete().eq("id", packageId);
    await removeStoredObjects(paths);
  }

  return { ok: true };
}

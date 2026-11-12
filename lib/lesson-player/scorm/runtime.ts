import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { resolveLessonPackage } from "@/lib/lesson-player/progress";
import {
  contentTypeForPath,
  LESSON_PACKAGE_BUCKET,
} from "@/lib/lesson-player/scorm/store-package";
import type { LessonPackageKind, LessonPlayerLaunch } from "@/lib/lesson-player/types";

const PERSISTED_KEYS = [
  "cmi.core.lesson_status",
  "cmi.core.lesson_location",
  "cmi.core.score.raw",
  "cmi.core.score.min",
  "cmi.core.score.max",
  "cmi.suspend_data",
  "cmi.core.session_time",
  "cmi.core.exit",
  // 0–100, written by the player from the package's own page position.
  "cmi.progress_measure",
] as const;

const MAX_VALUE_LENGTH = 200_000;

function scormStudentName(fullName: string | null, email: string | null): string {
  const name = fullName?.trim();
  if (name && name.includes(" ")) {
    const parts = name.split(/\s+/);
    const last = parts.pop();
    return `${last}, ${parts.join(" ")}`;
  }
  return name || email || "Learner";
}

function numOrNull(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export async function getLessonPlayerLaunch(
  supabase: SupabaseClient,
  options: {
    lessonId: string;
    userId: string;
    kind: LessonPackageKind;
    courseVersionId?: string | null;
    fullName?: string | null;
    email?: string | null;
  }
): Promise<LessonPlayerLaunch | null> {
  const pkg = await resolveLessonPackage(supabase, options);
  if (!pkg) return null;

  const { data: row } = await supabase
    .from("lesson_packages")
    .select("id, title, launch_path")
    .eq("id", pkg.id)
    .maybeSingle();
  if (!row?.launch_path) return null;

  const { data: attempt } = await supabase
    .from("lesson_player_attempts")
    .select("lesson_status, lesson_location, suspend_data, score_raw, score_min, score_max, updated_at")
    .eq("package_id", pkg.id)
    .eq("user_id", options.userId)
    .maybeSingle();

  const suspend = typeof attempt?.suspend_data === "string" ? attempt.suspend_data : "";
  const status =
    typeof attempt?.lesson_status === "string" && attempt.lesson_status
      ? attempt.lesson_status
      : "not attempted";

  const initialCmi: Record<string, string> = {
    "cmi.core.student_id": options.userId,
    "cmi.core.student_name": scormStudentName(options.fullName ?? null, options.email ?? null),
    "cmi.core.lesson_status": status,
    "cmi.core.lesson_location":
      typeof attempt?.lesson_location === "string" ? attempt.lesson_location : "",
    "cmi.suspend_data": suspend,
    "cmi.core.score.raw":
      attempt?.score_raw == null ? "" : String(attempt.score_raw),
    "cmi.core.score.min":
      attempt?.score_min == null ? "" : String(attempt.score_min),
    "cmi.core.score.max":
      attempt?.score_max == null ? "" : String(attempt.score_max),
    "cmi.core.credit": "credit",
    "cmi.core.lesson_mode": "normal",
    "cmi.core.entry": suspend ? "resume" : "ab-initio",
    "cmi.core.exit": "",
    "cmi.core.session_time": "",
    "cmi.core.total_time": "0000:00:00.00",
  };

  return {
    lessonId: options.lessonId,
    kind: options.kind,
    packageId: pkg.id,
    title: String(row.title ?? pkg.title ?? "Lesson"),
    launchPath: String(row.launch_path),
    resumeKey: `${pkg.id}:${attempt?.updated_at ?? "new"}`,
    initialCmi,
  };
}

export async function commitLessonPlayerAttempt(
  supabase: SupabaseClient,
  options: {
    userId: string;
    packageId: string;
    cmi: Record<string, unknown>;
    finish: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: pkg } = await supabase
    .from("lesson_packages")
    .select("id, lesson_id, kind")
    .eq("id", options.packageId)
    .maybeSingle();
  if (!pkg) return { ok: false, error: "Package not found." };

  let coursewareRevision: number | null = null;
  if (pkg.kind === "content" && typeof pkg.lesson_id === "string") {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("courseware_revision")
      .eq("id", pkg.lesson_id)
      .maybeSingle();
    const revision = Number(lesson?.courseware_revision ?? 0);
    coursewareRevision = revision > 0 ? revision : null;
  }

  const stored: Record<string, string> = {};
  for (const key of PERSISTED_KEYS) {
    const value = options.cmi[key];
    if (typeof value !== "string") continue;
    if (value.length > MAX_VALUE_LENGTH) {
      return { ok: false, error: "Saved lesson data is too large." };
    }
    stored[key] = value;
  }

  const status = (stored["cmi.core.lesson_status"] || "incomplete").slice(0, 40);
  const terminal =
    options.finish ||
    status === "passed" ||
    status === "failed" ||
    status === "completed";

  const row = {
    package_id: options.packageId,
    lesson_id: typeof pkg.lesson_id === "string" ? pkg.lesson_id : null,
    courseware_revision: coursewareRevision,
    user_id: options.userId,
    lesson_status: status,
    score_raw: numOrNull(stored["cmi.core.score.raw"]),
    score_min: numOrNull(stored["cmi.core.score.min"]),
    score_max: numOrNull(stored["cmi.core.score.max"]),
    lesson_location: stored["cmi.core.lesson_location"] ?? null,
    suspend_data: stored["cmi.suspend_data"] ?? null,
    session_time: stored["cmi.core.session_time"] ?? null,
    exit_mode: stored["cmi.core.exit"] ?? null,
    cmi: stored,
    finished_at: terminal ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("lesson_player_attempts")
    .upsert(row, { onConflict: "package_id,user_id" });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function readLessonPackageFile(
  supabase: SupabaseClient,
  packageId: string,
  relativePath: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!relativePath || relativePath.includes("..") || relativePath.startsWith("/")) {
    return null;
  }

  const { data: pkg } = await supabase
    .from("lesson_packages")
    .select("id")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) return null;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.storage
    .from(LESSON_PACKAGE_BUCKET)
    .download(`${packageId}/${relativePath}`);
  if (error || !data) return null;

  const bytes = new Uint8Array(await data.arrayBuffer());
  return { bytes, contentType: contentTypeForPath(relativePath) };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { lessonPlayerHref } from "@/lib/lesson-player/href";
import type {
  LessonPackageKind,
  LessonPlayerProgress,
  LessonPlayerStatus,
} from "@/lib/lesson-player/types";

type PackagePointer = {
  id: string;
  title: string;
};

const PACKAGE_COLUMN: Record<LessonPackageKind, "content_package_id" | "test_package_id"> = {
  content: "content_package_id",
  test: "test_package_id",
};

function asStatus(raw: string | null | undefined): LessonPlayerStatus {
  const s = (raw ?? "").trim().toLowerCase();
  if (
    s === "passed" ||
    s === "completed" ||
    s === "failed" ||
    s === "incomplete" ||
    s === "browsed" ||
    s === "not attempted"
  ) {
    return s === "not attempted" ? "not_attempted" : s;
  }
  return "not_attempted";
}

export function lessonPlayerStatusSatisfied(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "passed" || s === "completed";
}

function bookmarkPercent(cmi: unknown): number | null {
  if (!cmi || typeof cmi !== "object") return null;
  const raw = (cmi as Record<string, unknown>)["cmi.progress_measure"];
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const n = typeof raw === "number" ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function percentFor(
  status: LessonPlayerStatus,
  score: number | null,
  bookmark: number | null
): number {
  if (status === "passed" || status === "completed") return 100;
  if (status === "failed") {
    const n = score ?? 0;
    return Math.min(100, Math.max(1, Math.round(n)));
  }
  if (status === "incomplete" || status === "browsed") {
    return bookmark ?? 1;
  }
  return 0;
}

function labelFor(status: LessonPlayerStatus, score: number | null): string {
  if (status === "passed" || status === "completed") return "Passed";
  if (status === "failed") {
    return score != null ? `Not passed · ${Math.round(score)}%` : "Not passed";
  }
  if (status === "incomplete" || status === "browsed") return "In progress";
  return "Not started";
}

export async function resolveLessonPackage(
  supabase: SupabaseClient,
  options: {
    lessonId: string;
    kind: LessonPackageKind;
    courseVersionId?: string | null;
  }
): Promise<PackagePointer | null> {
  const column = PACKAGE_COLUMN[options.kind];

  if (options.courseVersionId) {
    const { data: modules } = await supabase
      .from("course_version_modules")
      .select("id")
      .eq("course_version_id", options.courseVersionId);
    const moduleIds = (modules ?? []).map((m) => m.id as string);
    if (moduleIds.length > 0) {
      const { data: versionLesson } = await supabase
        .from("course_version_lessons")
        .select("content_package_id, test_package_id")
        .in("course_version_module_id", moduleIds)
        .eq("source_lesson_id", options.lessonId)
        .maybeSingle();
      const pinned = versionLesson?.[column];
      if (typeof pinned === "string" && pinned) {
        const { data: pkg } = await supabase
          .from("lesson_packages")
          .select("id, title")
          .eq("id", pinned)
          .maybeSingle();
        if (pkg?.id) {
          return { id: pkg.id as string, title: String(pkg.title ?? "") };
        }
      }
    }
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("content_package_id, test_package_id")
    .eq("id", options.lessonId)
    .maybeSingle();
  const live = lesson?.[column];
  if (typeof live !== "string" || !live) return null;

  const { data: pkg } = await supabase
    .from("lesson_packages")
    .select("id, title")
    .eq("id", live)
    .maybeSingle();
  if (!pkg?.id) return null;
  return { id: pkg.id as string, title: String(pkg.title ?? "") };
}

export async function getLessonPlayerProgress(
  supabase: SupabaseClient,
  options: {
    lessonId: string;
    userId: string;
    kind: LessonPackageKind;
    courseVersionId?: string | null;
    returnPath?: string | null;
  }
): Promise<LessonPlayerProgress> {
  const pkg = await resolveLessonPackage(supabase, options);
  if (!pkg) {
    return {
      kind: options.kind,
      available: false,
      percent: 0,
      status: "unavailable",
      statusLabel: null,
      playHref: null,
      packageId: null,
      packageTitle: null,
      updatedAt: null,
      message:
        options.kind === "test"
          ? "No test has been added to this lesson."
          : "No lesson has been added yet.",
      coursewareRevision: null,
      priorCompletion: null,
    };
  }

  const { data: attempt } = await supabase
    .from("lesson_player_attempts")
    .select("id, lesson_status, score_raw, updated_at, cmi, courseware_revision")
    .eq("package_id", pkg.id)
    .eq("user_id", options.userId)
    .maybeSingle();

  let currentRevision: number | null = null;
  if (options.kind === "content") {
    if (options.courseVersionId) {
      const { data: versionModules } = await supabase
        .from("course_version_modules")
        .select("id")
        .eq("course_version_id", options.courseVersionId);
      const versionModuleIds = (versionModules ?? []).map((m) => m.id as string);
      if (versionModuleIds.length > 0) {
        const { data: versionLesson } = await supabase
          .from("course_version_lessons")
          .select("courseware_revision")
          .in("course_version_module_id", versionModuleIds)
          .eq("source_lesson_id", options.lessonId)
          .maybeSingle();
        const revision = Number(versionLesson?.courseware_revision ?? 0);
        if (revision > 0) currentRevision = revision;
      }
    }
    if (currentRevision == null) {
      const { data: lesson } = await supabase
        .from("lessons")
        .select("courseware_revision")
        .eq("id", options.lessonId)
        .maybeSingle();
      const revision = Number(lesson?.courseware_revision ?? 0);
      if (revision > 0) currentRevision = revision;
    }
  }

  let priorCompletion: LessonPlayerProgress["priorCompletion"] = null;
  if (options.kind === "content") {
    const { data: earlier } = await supabase
      .from("lesson_player_attempts")
      .select("id, lesson_status, courseware_revision, updated_at")
      .eq("lesson_id", options.lessonId)
      .eq("user_id", options.userId)
      .order("updated_at", { ascending: false });
    const prior = (earlier ?? []).find((row) => {
      if (attempt?.id && row.id === attempt.id) return false;
      const revision = Number(row.courseware_revision ?? 0);
      return revision > 0 && lessonPlayerStatusSatisfied(String(row.lesson_status ?? ""));
    });
    if (prior) {
      priorCompletion = {
        status: asStatus(String(prior.lesson_status ?? "")),
        coursewareRevision: Number(prior.courseware_revision),
      };
    }
  }

  const status = asStatus(
    typeof attempt?.lesson_status === "string" ? attempt.lesson_status : null
  );
  const score =
    attempt?.score_raw == null ? null : Number(attempt.score_raw);
  const scoreOrNull = score != null && Number.isFinite(score) ? score : null;

  return {
    kind: options.kind,
    available: true,
    percent: percentFor(status, scoreOrNull, bookmarkPercent(attempt?.cmi)),
    status,
    statusLabel: labelFor(status, scoreOrNull),
    playHref: lessonPlayerHref({
      lessonId: options.lessonId,
      kind: options.kind,
      returnPath: options.returnPath,
      courseVersionId: options.courseVersionId,
    }),
    packageId: pkg.id,
    packageTitle: pkg.title || null,
    updatedAt: typeof attempt?.updated_at === "string" ? attempt.updated_at : null,
    message: null,
    coursewareRevision:
      Number(attempt?.courseware_revision ?? 0) > 0
        ? Number(attempt?.courseware_revision)
        : currentRevision,
    priorCompletion,
  };
}

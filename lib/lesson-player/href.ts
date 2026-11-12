import type { LessonPackageKind } from "@/lib/lesson-player/types";

export function safeReturnPath(
  raw: string | null | undefined,
  fallback: string
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return fallback;
  }
  return raw;
}

export function lessonPlayerHref(options: {
  lessonId: string;
  kind: LessonPackageKind;
  returnPath?: string | null;
  courseVersionId?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("kind", options.kind);
  if (options.courseVersionId) {
    params.set("courseVersion", options.courseVersionId);
  }
  if (options.returnPath) {
    params.set("return", safeReturnPath(options.returnPath, ""));
    if (!params.get("return")) params.delete("return");
  }
  return `/dashboard/lesson-player/${options.lessonId}?${params.toString()}`;
}

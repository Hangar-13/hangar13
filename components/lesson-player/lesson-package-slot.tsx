"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearLessonPackageAction,
  uploadLessonPackage,
} from "@/app/actions/lesson-player";
import type { LessonPackageKind, LessonPackageSummary } from "@/lib/lesson-player";
import { lessonPlayerHref } from "@/lib/lesson-player";
import { Button } from "@/components/ui/button";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";

type Props = {
  lessonId: string;
  kind: LessonPackageKind;
  label: string;
  emptyLabel: string;
  pkg: LessonPackageSummary | null;
  returnPath: string;
};

export function LessonPackageSlot({
  lessonId,
  kind,
  label,
  emptyLabel,
  pkg,
  returnPath,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("package", file);
    startTransition(async () => {
      const result = await uploadLessonPackage(lessonId, kind, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  function onClear() {
    setError(null);
    startTransition(async () => {
      const result = await clearLessonPackageAction(lessonId, kind);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const detail = pkg
    ? [
        `SCORM ${pkg.schemaVersion}`,
        pkg.scoCount === 1 ? "1 item" : `${pkg.scoCount} items`,
        pkg.masteryScore != null ? `pass at ${pkg.masteryScore}%` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="max-w-3xl space-y-2">
      <DashboardSectionLabel>{label}</DashboardSectionLabel>
      {pkg ? (
        <div className="space-y-2 rounded-md bg-muted/25 px-4 py-3 ring-1 ring-black/[0.04]">
          <p className="text-sm font-medium">{pkg.title}</p>
          <p className="text-xs text-muted-foreground">
            {detail}
            {pkg.originalFilename ? ` · ${pkg.originalFilename}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <a href={lessonPlayerHref({ lessonId, kind, returnPath })}>Preview</a>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              Replace zip
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onClear}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md bg-muted/25 px-4 py-3 ring-1 ring-black/[0.04] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            Upload SCORM zip
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label={label}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

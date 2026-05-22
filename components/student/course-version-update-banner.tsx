"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import {
  acceptCourseVersionUpdate,
  type CourseVersionUpdateOfferView,
} from "@/app/actions/course-version-adoption";
import { Button } from "@/components/ui/button";

type Props = {
  updates: CourseVersionUpdateOfferView[];
};

export function CourseVersionUpdateBanner({ updates }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (updates.length === 0) return null;

  function accept(update: CourseVersionUpdateOfferView) {
    setError(null);
    setPendingId(update.courseId);
    startTransition(async () => {
      const res = await acceptCourseVersionUpdate({
        courseId: update.courseId,
        courseVersionId: update.latestVersionId,
      });
      setPendingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ArrowUpCircle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <p className="font-medium text-sm">Course updates available</p>
          <p className="text-sm text-muted-foreground">
            New course versions are published. Accept an update to see the latest
            content in your training program.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {updates.map((u) => (
          <li
            key={u.courseId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{u.courseName}</span>
              <span className="text-muted-foreground ml-2 tabular-nums">
                v{u.pinnedLabel} → v{u.latestLabel}
              </span>
              {u.releaseNotes ? (
                <p className="text-muted-foreground text-xs mt-1">{u.releaseNotes}</p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => accept(u)}
              disabled={pendingId === u.courseId}
            >
              {pendingId === u.courseId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Update to latest"
              )}
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

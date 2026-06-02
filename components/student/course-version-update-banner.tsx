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
    <div className="relative mb-6 overflow-hidden rounded-md bg-amber-500/10 px-5 py-4 ring-1 ring-amber-500/20">
      <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden />
      <div className="space-y-3 pl-2">
        <div className="flex items-start gap-2">
          <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Course updates available</p>
            <p className="text-sm text-muted-foreground">
              New course versions are published. Accept an update to see the latest
              content in your training program.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border/25 rounded-md ring-1 ring-black/[0.04]">
          {updates.map((u) => (
            <li
              key={u.courseId}
              className="flex flex-wrap items-center justify-between gap-2 bg-background/80 px-3 py-2.5 text-sm first:rounded-t-md last:rounded-b-md"
            >
              <div className="min-w-0">
                <span className="font-medium">{u.courseName}</span>
                <span className="ml-2 tabular-nums text-muted-foreground">
                  v{u.pinnedLabel} → v{u.latestLabel}
                </span>
                {u.releaseNotes ? (
                  <p className="mt-1 text-xs text-muted-foreground">{u.releaseNotes}</p>
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
    </div>
  );
}

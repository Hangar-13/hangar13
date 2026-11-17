"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  acceptCourseVersionUpdate,
  type CourseVersionUpdateMode,
  type CourseVersionUpdateOfferView,
} from "@/app/actions/course-version-adoption";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  updates: CourseVersionUpdateOfferView[];
};

export function CourseVersionUpdateBanner({ updates }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openUpdate, setOpenUpdate] = useState<CourseVersionUpdateOfferView | null>(null);
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  if (updates.length === 0) return null;

  function apply(update: CourseVersionUpdateOfferView, mode: CourseVersionUpdateMode, lessonIds?: string[]) {
    setError(null);
    setPendingId(update.courseId);
    startTransition(async () => {
      const res = await acceptCourseVersionUpdate({
        courseId: update.courseId,
        courseVersionId: update.latestVersionId,
        mode,
        lessonIds,
      });
      setPendingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpenUpdate(null);
      router.refresh();
    });
  }

  function requestUpdate(update: CourseVersionUpdateOfferView) {
    if (update.lessonsWithProgress.length === 0) {
      apply(update, "all");
      return;
    }
    setChosenIds([]);
    setOpenUpdate(update);
  }

  function toggleLesson(lessonId: string) {
    setChosenIds((current) =>
      current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId]
    );
  }

  const busy = openUpdate != null && pendingId === openUpdate.courseId;

  return (
    <div className="relative mb-6 overflow-hidden rounded-md bg-amber-500/10 px-5 py-4 ring-1 ring-amber-500/20">
      <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden />
      <ul className="space-y-3 pl-2">
        {updates.map((update) => (
          <li
            key={update.courseId}
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{update.courseName}</span>
              <span className="ml-2 tabular-nums text-muted-foreground">
                {update.pinnedLabel} → {update.latestLabel}
              </span>
              {update.releaseNotes ? (
                <p className="mt-1 text-xs text-muted-foreground">{update.releaseNotes}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Course update available</span>
              <Button
                type="button"
                size="sm"
                onClick={() => requestUpdate(update)}
                disabled={pendingId === update.courseId}
              >
                {pendingId === update.courseId && openUpdate == null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Update course"
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 pl-2 text-sm text-destructive">{error}</p> : null}

      <Dialog
        open={openUpdate != null}
        onOpenChange={(open) => {
          if (!open && !busy) setOpenUpdate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update course</DialogTitle>
            <DialogDescription>
              Updating a lesson resets your progress for that lesson. Update all
              lessons resets progress on every lesson listed here.
            </DialogDescription>
          </DialogHeader>
          {openUpdate ? (
            <div className="space-y-3">
              <p className="text-sm">
                These lessons have progress. Check a lesson to update it and reset
                that progress. Lessons you have not started update with the course.
                Lessons covered by prior experience stay as they are unless you have
                progress on them.
              </p>
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {openUpdate.lessonsWithProgress.map((lesson) => (
                  <li key={lesson.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={chosenIds.includes(lesson.id)}
                        onChange={() => toggleLesson(lesson.id)}
                      />
                      <span>{lesson.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
            <Button
              type="button"
              variant="outline"
              disabled={busy || openUpdate == null}
              onClick={() => openUpdate && apply(openUpdate, "keep-progress")}
            >
              Keep lessons with progress
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || openUpdate == null || chosenIds.length === 0}
              onClick={() => openUpdate && apply(openUpdate, "selected", chosenIds)}
            >
              Update checked lessons
            </Button>
            <Button
              type="button"
              disabled={busy || openUpdate == null}
              onClick={() => openUpdate && apply(openUpdate, "all")}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update all lessons"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

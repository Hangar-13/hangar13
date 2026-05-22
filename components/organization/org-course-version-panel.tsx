"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { orgPinCourseVersion } from "@/app/actions/course-version-adoption";
import { Button } from "@/components/ui/button";

export type OrgCourseVersionRow = {
  courseId: string;
  courseName: string;
  pinnedLabel: string | null;
  latestLabel: string;
  latestVersionId: string;
  courseVersionId: string | null;
  hasUpdate: boolean;
};

type Props = {
  trainingPathId: string;
  trainingPathName: string;
  rows: OrgCourseVersionRow[];
};

export function OrgCourseVersionPanel({
  trainingPathId,
  trainingPathName,
  rows,
}: Props) {
  const router = useRouter();
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function pin(courseId: string, courseVersionId: string) {
    setError(null);
    setPendingCourseId(courseId);
    startTransition(async () => {
      const res = await orgPinCourseVersion({ courseId, courseVersionId });
      setPendingCourseId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="font-medium">{trainingPathName}</h3>
        <p className="text-sm text-muted-foreground">
          Pin course versions for learners enrolled through your organization.
        </p>
      </div>
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((row) => (
          <li
            key={row.courseId}
            className="flex flex-wrap items-center justify-between gap-2 p-3"
          >
            <div>
              <span className="font-medium">{row.courseName}</span>
              <span className="text-muted-foreground ml-2 tabular-nums">
                {row.pinnedLabel ? `Pinned v${row.pinnedLabel}` : "Not pinned"}
                {" · "}
                Latest v{row.latestLabel}
              </span>
            </div>
            <div className="flex gap-2">
              {row.hasUpdate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={pendingCourseId === row.courseId}
                  onClick={() => pin(row.courseId, row.latestVersionId)}
                >
                  {pendingCourseId === row.courseId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `Adopt v${row.latestLabel}`
                  )}
                </Button>
              ) : row.courseVersionId ? (
                <span className="text-xs text-muted-foreground self-center">
                  Up to date
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendingCourseId === row.courseId}
                  onClick={() => pin(row.courseId, row.latestVersionId)}
                >
                  {pendingCourseId === row.courseId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `Pin v${row.latestLabel}`
                  )}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <input type="hidden" value={trainingPathId} readOnly aria-hidden />
    </div>
  );
}

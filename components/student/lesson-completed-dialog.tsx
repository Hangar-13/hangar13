"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LessonCompletedDialog({
  nextWeek,
}: {
  /** First lesson that is neither finished nor optional. Null when none remain. */
  nextWeek: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function stay() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("completed");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function goNext() {
    if (nextWeek == null) return;
    router.push(`/dashboard/student/training?week=${nextWeek}`);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) stay(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lesson completed</DialogTitle>
          <DialogDescription>
            {nextWeek == null
              ? "This lesson is completed. The required lessons in this course are done."
              : "This lesson is completed. Go to the next lesson, or stay on this one."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={stay}>
            Stay
          </Button>
          {nextWeek != null ? (
            <Button type="button" onClick={goNext}>
              Next lesson
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

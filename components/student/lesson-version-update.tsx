"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { releaseLessonVersionHold } from "@/app/actions/course-version-adoption";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LessonVersionUpdate({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await releaseLessonVersionHold(lessonId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted-foreground">A newer version of this lesson is available.</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Update lesson
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update lesson</DialogTitle>
            <DialogDescription>
              Updating this lesson will reset your progress for it.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={confirm}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update lesson"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

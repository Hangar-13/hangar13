"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Tag } from "lucide-react";
import {
  managerListCourseVersions,
  managerPublishCourseVersion,
  type ManagerCourseVersionSummary,
} from "@/app/actions/manager-course-versions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatUiDateTime } from "@/lib/format-ui-date";

type Props = {
  courseId: string;
  initialVersions: ManagerCourseVersionSummary[];
};

export function CourseVersionsPanel({ courseId, initialVersions }: Props) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState<"minor" | "major">("minor");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refreshVersions() {
    startTransition(async () => {
      const res = await managerListCourseVersions(courseId);
      if (res.ok) setVersions(res.versions);
    });
  }

  function publish() {
    setError(null);
    startTransition(async () => {
      const res = await managerPublishCourseVersion({
        courseId,
        bump,
        releaseNotes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReleaseNotes("");
      setBump("minor");
      refreshVersions();
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Tag className="h-5 w-5 text-muted-foreground" />
            Course versions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Publish a snapshot when learners should see updated content. Minor bumps
            for small changes; major bumps for structural overhauls.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={pending}>
          Publish new version
        </Button>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published versions yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
              <div>
                <span className="font-medium tabular-nums">v{v.label}</span>
                {v.isLatest ? (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    Latest
                  </span>
                ) : null}
                {v.releaseNotes ? (
                  <p className="text-muted-foreground mt-1">{v.releaseNotes}</p>
                ) : null}
              </div>
              <time className="text-muted-foreground text-xs shrink-0">
                {formatUiDateTime(v.publishedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish course version</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Version bump</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={bump === "minor" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBump("minor")}
                  disabled={pending}
                >
                  Minor (e.g. 1.0 → 1.1)
                </Button>
                <Button
                  type="button"
                  variant={bump === "major" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBump("major")}
                  disabled={pending}
                >
                  Major (e.g. 1.2 → 2.0)
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-notes">Release notes (optional)</Label>
              <Textarea
                id="release-notes"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="What changed in this version?"
                rows={4}
                disabled={pending}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={publish} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

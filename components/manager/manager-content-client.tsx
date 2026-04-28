"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createManagerCourse } from "@/app/actions/manager-course";
import { createManagerTrainingPath } from "@/app/actions/manager-training-path";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CatalogVisibilityBadge } from "@/components/manager/catalog-visibility-badge";
import { normalizeCatalogVisibility } from "@/lib/catalog-visibility";

export type ManagerContentLists = {
  trainingPaths: Array<{ id: string; name: string; visibility: string }>;
  courses: Array<{
    id: string;
    name: string;
    description: string | null;
    visibility: string;
  }>;
};

export function ManagerContentClient({ lists }: { lists: ManagerContentLists }) {
  const router = useRouter();
  const [courseOpen, setCourseOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pathTitle, setPathTitle] = useState("");
  const [pathDescription, setPathDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pathFormError, setPathFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pathPending, startPathTransition] = useTransition();

  function resetCourseForm() {
    setTitle("");
    setDescription("");
    setFormError(null);
  }

  function resetPathForm() {
    setPathTitle("");
    setPathDescription("");
    setPathFormError(null);
  }

  function handleCourseOpenChange(open: boolean) {
    setCourseOpen(open);
    if (!open) resetCourseForm();
  }

  function handlePathOpenChange(open: boolean) {
    setPathOpen(open);
    if (!open) resetPathForm();
  }

  function handleCreateTrainingPath() {
    setPathFormError(null);
    startPathTransition(async () => {
      const result = await createManagerTrainingPath({
        title: pathTitle,
        description: pathDescription,
      });
      if (!result.ok) {
        setPathFormError(result.error);
        return;
      }
      setPathOpen(false);
      resetPathForm();
      router.push(`/dashboard/manager/training-paths/${result.trainingPathId}`);
    });
  }

  function handleCreateCourse() {
    setFormError(null);
    startTransition(async () => {
      const result = await createManagerCourse({ title, description });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setCourseOpen(false);
      resetCourseForm();
      router.push(`/dashboard/manager/courses/${result.courseId}`);
    });
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Training Paths</h2>
        {lists.trainingPaths.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have not created any training paths yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card overflow-hidden">
            {lists.trainingPaths.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/manager/training-paths/${p.id}`}
                  className={cn(
                    "relative block px-4 py-3 pr-28 text-sm transition-colors",
                    "hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  )}
                >
                  <CatalogVisibilityBadge
                    visibility={normalizeCatalogVisibility(
                      p.visibility,
                      "public"
                    )}
                    className="absolute top-3 right-3"
                  />
                  <span className="font-medium text-foreground">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => setPathOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          Create New Training Path
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Courses</h2>
        {lists.courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have not created any courses yet.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card overflow-hidden">
            {lists.courses.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/manager/courses/${c.id}`}
                  className={cn(
                    "relative block px-4 py-3 pr-28 transition-colors",
                    "hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  )}
                >
                  <CatalogVisibilityBadge
                    visibility={normalizeCatalogVisibility(
                      c.visibility,
                      "proprietary"
                    )}
                    className="absolute top-3 right-3"
                  />
                  <span className="text-sm font-medium text-foreground">
                    {c.name}
                  </span>
                  {c.description ? (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {c.description}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => setCourseOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          Create New Course
        </Button>
      </section>

      <Dialog open={pathOpen} onOpenChange={handlePathOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Training Path</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="path-title">Title</Label>
              <Input
                id="path-title"
                value={pathTitle}
                onChange={(e) => setPathTitle(e.target.value)}
                placeholder="Training path title"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="path-description">Description</Label>
              <Textarea
                id="path-description"
                value={pathDescription}
                onChange={(e) => setPathDescription(e.target.value)}
                placeholder="What this path covers"
                rows={4}
                className="resize-y min-h-[100px]"
              />
            </div>
            {pathFormError ? (
              <p className="text-sm text-destructive" role="alert">
                {pathFormError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePathOpenChange(false)}
              disabled={pathPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateTrainingPath}
              disabled={pathPending || !pathTitle.trim()}
            >
              {pathPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={courseOpen} onOpenChange={handleCourseOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="course-title">Title</Label>
              <Input
                id="course-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Course title"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-description">Description</Label>
              <Textarea
                id="course-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this course covers"
                rows={4}
                className="resize-y min-h-[100px]"
              />
            </div>
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCourseOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateCourse}
              disabled={isPending || !title.trim()}
            >
              {isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

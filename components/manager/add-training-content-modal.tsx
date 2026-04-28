"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { addTrainingPathItems, type TrainingPathPick } from "@/app/actions/manager-training-path";
import type {
  TrainingContentCatalogCourse,
  TrainingContentCatalogModule,
} from "@/lib/manager-training-catalog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SearchScope = "all" | "courses" | "modules" | "lessons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainingPathId: string;
  catalog: TrainingContentCatalogCourse[];
  existingKeys: Set<string>;
  onAdded: () => void;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

function textMatches(hay: string, needle: string) {
  if (!needle) return true;
  return norm(hay).includes(needle);
}

function keyCourse(id: string) {
  return `c:${id}`;
}
function keyModule(id: string) {
  return `m:${id}`;
}
function keyLesson(id: string) {
  return `l:${id}`;
}

export function AddTrainingContentModal({
  open,
  onOpenChange,
  trainingPathId,
  catalog,
  existingKeys,
  onAdded,
}: Props) {
  const [scope, setScope] = useState<SearchScope>("all");
  const [search, setSearch] = useState("");
  const [manualCourseOpen, setManualCourseOpen] = useState<Record<string, boolean>>(
    {}
  );
  const [manualModuleOpen, setManualModuleOpen] = useState<Record<string, boolean>>(
    {}
  );
  const [checkedCourse, setCheckedCourse] = useState<Record<string, boolean>>({});
  const [checkedModule, setCheckedModule] = useState<Record<string, boolean>>({});
  const [checkedLesson, setCheckedLesson] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const q = norm(search);

  useEffect(() => {
    if (!open) {
      setScope("all");
      setSearch("");
      setManualCourseOpen({});
      setManualModuleOpen({});
      setCheckedCourse({});
      setCheckedModule({});
      setCheckedLesson({});
      setError(null);
    }
  }, [open]);

  const effectiveCourseOpen = useCallback(
    (courseId: string) => {
      if (scope === "modules" || scope === "lessons") return true;
      return manualCourseOpen[courseId] === true;
    },
    [scope, manualCourseOpen]
  );

  const effectiveModuleOpen = useCallback(
    (moduleId: string) => {
      if (scope === "lessons") return true;
      return manualModuleOpen[moduleId] === true;
    },
    [scope, manualModuleOpen]
  );

  const filteredCatalog = useMemo(() => {
    const result: TrainingContentCatalogCourse[] = [];

    for (const c of catalog) {
      const courseMatch = textMatches(c.name, q) || textMatches(c.description ?? "", q);

      if (scope === "courses") {
        if (!q || courseMatch) {
          result.push({ ...c, modules: [] });
        }
        continue;
      }

      const modulesOut: typeof c.modules = [];
      for (const m of c.modules) {
        const modMatch =
          textMatches(m.title, q) || textMatches(m.description ?? "", q);
        const lessonsOut = m.lessons.filter(
          (l) =>
            textMatches(l.title, q) || textMatches(l.descriptionText, q)
        );

        if (scope === "modules") {
          if (!q) {
            modulesOut.push(m);
          } else if (courseMatch || modMatch) {
            modulesOut.push(m);
          }
        } else if (scope === "lessons") {
          if (!q) {
            modulesOut.push(m);
          } else if (courseMatch || modMatch) {
            modulesOut.push(m);
          } else if (lessonsOut.length > 0) {
            modulesOut.push({ ...m, lessons: lessonsOut });
          }
        } else {
          // all
          if (!q) {
            modulesOut.push(m);
          } else if (
            courseMatch ||
            modMatch ||
            lessonsOut.length > 0 ||
            m.lessons.some(
              (l) =>
                textMatches(l.title, q) ||
                textMatches(l.descriptionText, q)
            )
          ) {
            const keepLessons = m.lessons.filter(
              (l) =>
                courseMatch ||
                modMatch ||
                textMatches(l.title, q) ||
                textMatches(l.descriptionText, q)
            );
            modulesOut.push({
              ...m,
              lessons: keepLessons.length ? keepLessons : m.lessons,
            });
          }
        }
      }

      if (scope === "modules") {
        if (!q || courseMatch || modulesOut.length > 0) {
          result.push({ ...c, modules: modulesOut });
        }
      } else if (scope === "lessons") {
        if (!q || courseMatch || modulesOut.length > 0) {
          result.push({ ...c, modules: modulesOut });
        }
      } else {
        if (!q || courseMatch || modulesOut.length > 0) {
          result.push({ ...c, modules: modulesOut });
        }
      }
    }

    return result;
  }, [catalog, scope, q]);

  const isCourseChecked = (id: string) => checkedCourse[id] === true;
  const isModuleChecked = (id: string) => checkedModule[id] === true;

  const ancestorBlocksModule = (courseId: string) =>
    isCourseChecked(courseId) || existingKeys.has(keyCourse(courseId));

  const ancestorBlocksLesson = (courseId: string, moduleId: string) =>
    ancestorBlocksModule(courseId) ||
    isModuleChecked(moduleId) ||
    existingKeys.has(keyModule(moduleId));

  const courseCheckboxDisabled = (courseId: string) =>
    existingKeys.has(keyCourse(courseId));

  const moduleCheckboxDisabled = (courseId: string, moduleId: string) =>
    ancestorBlocksModule(courseId) || existingKeys.has(keyModule(moduleId));

  const lessonCheckboxDisabled = (
    courseId: string,
    moduleId: string,
    lessonId: string
  ) =>
    ancestorBlocksLesson(courseId, moduleId) ||
    existingKeys.has(keyLesson(lessonId));

  /** Checking a course clears module/lesson selections under it; unchecking only clears the course. */
  function handleCourseCheckChange(
    course: TrainingContentCatalogCourse,
    on: boolean
  ) {
    if (on) {
      setCheckedCourse((prev) => ({ ...prev, [course.id]: true }));
      setCheckedModule((prev) => {
        const next = { ...prev };
        for (const m of course.modules) delete next[m.id];
        return next;
      });
      setCheckedLesson((prev) => {
        const next = { ...prev };
        for (const m of course.modules) {
          for (const l of m.lessons) delete next[l.id];
        }
        return next;
      });
    } else {
      setCheckedCourse((prev) => ({ ...prev, [course.id]: false }));
    }
  }

  /** Checking a module clears lesson selections under it; unchecking only clears the module. */
  function handleModuleCheckChange(
    mod: TrainingContentCatalogModule,
    on: boolean
  ) {
    if (on) {
      setCheckedModule((prev) => ({ ...prev, [mod.id]: true }));
      setCheckedLesson((prev) => {
        const next = { ...prev };
        for (const l of mod.lessons) delete next[l.id];
        return next;
      });
    } else {
      setCheckedModule((prev) => ({ ...prev, [mod.id]: false }));
    }
  }

  function toggleCourseExpand(id: string) {
    if (scope === "modules" || scope === "lessons") return;
    setManualCourseOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleModuleExpand(id: string) {
    if (scope === "lessons") return;
    setManualModuleOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function accept() {
    setError(null);
    const picks: TrainingPathPick[] = [];
    for (const c of catalog) {
      if (checkedCourse[c.id]) {
        picks.push({ kind: "course", id: c.id });
        continue;
      }
      for (const m of c.modules) {
        if (checkedModule[m.id]) {
          picks.push({ kind: "module", id: m.id });
          continue;
        }
        for (const l of m.lessons) {
          if (checkedLesson[l.id]) {
            picks.push({ kind: "lesson", id: l.id });
          }
        }
      }
    }
    startTransition(async () => {
      const r = await addTrainingPathItems(trainingPathId, picks);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      onAdded();
    });
  }

  const showCourseChildren = scope !== "courses";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>Add Training Content</DialogTitle>
        </DialogHeader>

        <div className="px-6 shrink-0 border-b border-border pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Label
                htmlFor="tp-search-scope"
                className="text-muted-foreground shrink-0 text-sm font-normal"
              >
                Search in
              </Label>
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as SearchScope)}
              >
                <SelectTrigger id="tp-search-scope" className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="courses">Courses</SelectItem>
                  <SelectItem value="modules">Modules</SelectItem>
                  <SelectItem value="lessons">Lessons</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="tp-content-search" className="sr-only">
                Search
              </Label>
              <Input
                id="tp-content-search"
                placeholder="Search title or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-6 py-3">
          {filteredCatalog.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No content matches your filters.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-20 border-b border-border/60 bg-muted shadow-sm">
                <tr>
                  <th className="w-10 py-2 text-left font-medium text-muted-foreground bg-muted" />
                  <th className="py-2 text-left font-medium text-muted-foreground bg-muted">
                    Content
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalog.map((course) => {
                  const cOpen = effectiveCourseOpen(course.id);
                  const cChecked = isCourseChecked(course.id);
                  const cDisabled = courseCheckboxDisabled(course.id);
                  const hasChildren =
                    showCourseChildren && course.modules.length > 0;
                  const canToggleCourse =
                    scope !== "modules" && scope !== "lessons" && hasChildren;

                  return (
                    <Fragment key={course.id}>
                      <tr className="border-b border-border/60 align-top">
                        <td className="py-2 pr-2 align-middle">
                          <input
                            type="checkbox"
                            className="rounded border-input"
                            checked={cChecked}
                            disabled={cDisabled || pending}
                            onChange={(e) =>
                              handleCourseCheckChange(course, e.target.checked)
                            }
                            aria-label={`Select course ${course.name}`}
                          />
                        </td>
                        <td className="py-2">
                          <div className="flex items-start gap-2 min-w-0">
                            {hasChildren ? (
                              <button
                                type="button"
                                className={cn(
                                  "shrink-0 mt-0.5 p-0.5 rounded hover:bg-muted",
                                  !canToggleCourse && "opacity-40 cursor-default"
                                )}
                                disabled={!canToggleCourse}
                                onClick={() => toggleCourseExpand(course.id)}
                                aria-expanded={cOpen}
                                aria-label={
                                  cOpen ? "Collapse course" : "Expand course"
                                }
                              >
                                {cOpen ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </button>
                            ) : (
                              <span className="w-5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="font-medium">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">
                                  Course
                                </span>
                                {course.name}
                              </div>
                              {course.description ? (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {course.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {showCourseChildren && cOpen
                        ? course.modules.map((mod) => {
                            const mOpen = effectiveModuleOpen(mod.id);
                            const mExplicit = isModuleChecked(mod.id);
                            const mCheckedDisplay =
                              mExplicit || isCourseChecked(course.id);
                            const mDis = moduleCheckboxDisabled(course.id, mod.id);
                            const mRowGrey =
                              ancestorBlocksModule(course.id) &&
                              !mExplicit &&
                              !isCourseChecked(course.id);
                            const showLessons =
                              scope !== "modules" && mod.lessons.length > 0;
                            const canToggleMod =
                              scope !== "lessons" && showLessons;

                            return (
                              <Fragment key={mod.id}>
                                <tr
                                  className={cn(
                                    "border-b border-border/60 align-top",
                                    mRowGrey && "opacity-50"
                                  )}
                                >
                                  <td className="py-2 pr-2 align-middle">
                                    <input
                                      type="checkbox"
                                      className="rounded border-input"
                                      checked={mCheckedDisplay}
                                      disabled={mDis || pending}
                                      onChange={(e) =>
                                        handleModuleCheckChange(
                                          mod,
                                          e.target.checked
                                        )
                                      }
                                      aria-label={`Select module ${mod.title}`}
                                    />
                                  </td>
                                  <td className="py-2 pl-6">
                                    <div className="flex items-start gap-2 min-w-0">
                                      {showLessons ? (
                                        <button
                                          type="button"
                                          className={cn(
                                            "shrink-0 mt-0.5 p-0.5 rounded hover:bg-muted",
                                            !canToggleMod &&
                                              "opacity-40 cursor-default"
                                          )}
                                          disabled={!canToggleMod}
                                          onClick={() =>
                                            toggleModuleExpand(mod.id)
                                          }
                                          aria-expanded={mOpen}
                                          aria-label={
                                            mOpen
                                              ? "Collapse module"
                                              : "Expand module"
                                          }
                                        >
                                          {mOpen ? (
                                            <ChevronDown className="size-4" />
                                          ) : (
                                            <ChevronRight className="size-4" />
                                          )}
                                        </button>
                                      ) : (
                                        <span className="w-5 shrink-0" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="font-medium">
                                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">
                                            Module
                                          </span>
                                          {mod.title}
                                        </div>
                                        {mod.description ? (
                                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                            {mod.description}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                                {showLessons && mOpen
                                  ? mod.lessons.map((les) => {
                                      const lExplicit =
                                        checkedLesson[les.id] === true;
                                      const lCheckedDisplay =
                                        lExplicit ||
                                        isModuleChecked(mod.id) ||
                                        isCourseChecked(course.id);
                                      const lDis = lessonCheckboxDisabled(
                                        course.id,
                                        mod.id,
                                        les.id
                                      );
                                      const lGrey =
                                        ancestorBlocksLesson(
                                          course.id,
                                          mod.id
                                        ) &&
                                        !lExplicit &&
                                        !isModuleChecked(mod.id) &&
                                        !isCourseChecked(course.id);
                                      return (
                                        <tr
                                          key={les.id}
                                          className={cn(
                                            "border-b border-border/60 align-top",
                                            lGrey && "opacity-50"
                                          )}
                                        >
                                          <td className="py-2 pr-2 align-middle">
                                            <input
                                              type="checkbox"
                                              className="rounded border-input"
                                              checked={lCheckedDisplay}
                                              disabled={lDis || pending}
                                              onChange={(e) =>
                                                setCheckedLesson((prev) => ({
                                                  ...prev,
                                                  [les.id]: e.target.checked,
                                                }))
                                              }
                                              aria-label={`Select lesson ${les.title}`}
                                            />
                                          </td>
                                          <td className="py-2 pl-12">
                                            <div className="min-w-0">
                                              <div className="font-medium">
                                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">
                                                  Lesson
                                                </span>
                                                {les.number}. {les.title}
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })
                                  : null}
                              </Fragment>
                            );
                          })
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {error ? (
          <p className="text-sm text-destructive px-6" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="px-6 py-4 border-t border-border gap-2 sm:gap-0 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={accept} disabled={pending}>
            {pending ? "Adding…" : "Accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

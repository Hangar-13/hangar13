"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LessonMapLesson = {
  id: string;
  number: number;
  title: string;
};

export type LessonMapModule = {
  id: string;
  title: string;
  number: number;
  lessons: LessonMapLesson[];
};

export type ModuleOrderEdit = {
  orderedModuleIds: string[];
  onOrderChange: (ids: string[]) => void;
  onRemoveModuleId?: (moduleId: string) => void;
};

/** Per-module lesson list while editing a course map. */
export type ModuleLessonsOrderEdit = {
  orderedLessonIds: string[];
  onOrderChange: (ids: string[]) => void;
  onRemoveLessonId?: (lessonId: string) => void;
};

export type LessonOrderEdit = {
  orderedLessonIds: string[];
  onOrderChange: (ids: string[]) => void;
  onRemoveLessonId?: (lessonId: string) => void;
};

type LessonMapProps = {
  courseId: string;
  modules: LessonMapModule[];
  lessonsOnly?: boolean;
  moduleId?: string;
  moduleOrderEdit?: ModuleOrderEdit;
  /** When set with module map edit, shows nested lessons (order + remove). */
  moduleLessonEditsByModuleId?: Record<string, ModuleLessonsOrderEdit>;
  lessonOrderEdit?: LessonOrderEdit;
};

function reorderIds(ids: string[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return ids;
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, sourceId);
  return next;
}

export function LessonMap({
  courseId,
  modules,
  lessonsOnly,
  moduleId,
  moduleOrderEdit,
  moduleLessonEditsByModuleId,
  lessonOrderEdit,
}: LessonMapProps) {
  const moduleById = useMemo(
    () => new Map(modules.map((m) => [m.id, m])),
    [modules]
  );

  const sortedModules = useMemo(() => {
    if (moduleOrderEdit) {
      if (moduleOrderEdit.orderedModuleIds.length) {
        return moduleOrderEdit.orderedModuleIds
          .map((id) => moduleById.get(id))
          .filter((m): m is LessonMapModule => m != null);
      }
      return [];
    }
    return [...modules].sort((a, b) => a.number - b.number);
  }, [modules, moduleById, moduleOrderEdit]);

  const lessonSourceMod =
    lessonsOnly && moduleId
      ? sortedModules.find((m) => m.id === moduleId)
      : null;
  const rawLessons = lessonSourceMod?.lessons ?? [];

  const orderedLessons = useMemo(() => {
    if (!lessonsOnly || !moduleId) {
      return [] as LessonMapLesson[];
    }
    if (lessonOrderEdit) {
      if (lessonOrderEdit.orderedLessonIds.length) {
        const byId = new Map(rawLessons.map((l) => [l.id, l]));
        return lessonOrderEdit.orderedLessonIds
          .map((id) => byId.get(id))
          .filter((l): l is LessonMapLesson => l != null);
      }
      return [];
    }
    return [...rawLessons].sort((a, b) => a.number - b.number);
  }, [lessonsOnly, moduleId, rawLessons, lessonOrderEdit]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (lessonsOnly) {
    if (!moduleId) {
      return (
        <p className="text-sm text-muted-foreground py-2">
          Module context is required for the lesson list.
        </p>
      );
    }
    if (orderedLessons.length === 0) {
      const editingEmpty =
        Boolean(lessonOrderEdit) &&
        (lessonOrderEdit?.orderedLessonIds.length ?? 0) === 0;
      if (!editingEmpty) {
        return (
          <p className="text-sm text-muted-foreground py-2">
            No lessons in this module yet.
          </p>
        );
      }
    }

    const editingLessons = Boolean(lessonOrderEdit);

    if (orderedLessons.length === 0 && editingLessons) {
      return (
        <p className="text-sm text-muted-foreground py-2">
          All lessons are marked for removal. Accept to review deletion, or
          cancel.
        </p>
      );
    }

    return (
      <ul className="space-y-2">
        {orderedLessons.map((lesson, idx) => {
          const displayNum = editingLessons ? idx + 1 : lesson.number;

          if (editingLessons && lessonOrderEdit) {
            return (
              <li key={lesson.id} className="list-none">
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", lesson.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sid = e.dataTransfer.getData("text/plain");
                    lessonOrderEdit.onOrderChange(
                      reorderIds(
                        lessonOrderEdit.orderedLessonIds,
                        sid,
                        lesson.id
                      )
                    );
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-md border bg-card px-2 py-2 text-sm",
                    "cursor-grab active:cursor-grabbing select-none"
                  )}
                >
                  <span className="inline-flex shrink-0 items-center justify-center p-0.5 text-base leading-none">
                    <GripVertical
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden
                    />
                  </span>
                  <span className="tabular-nums text-muted-foreground w-8 shrink-0">
                    {displayNum}
                  </span>
                  <span className="font-medium truncate min-w-0 flex-1">
                    {lesson.title}
                  </span>
                  {lessonOrderEdit.onRemoveLessonId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Remove ${lesson.title} from this module`}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        lessonOrderEdit.onRemoveLessonId?.(lesson.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          }

          return (
            <li key={lesson.id}>
              <Link
                href={`/dashboard/manager/courses/${courseId}/modules/${moduleId}/lessons/${lesson.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm",
                  "hover:bg-accent/50 transition-colors"
                )}
              >
                <span className="tabular-nums text-muted-foreground w-8 shrink-0">
                  {displayNum}
                </span>
                <span className="font-medium truncate">{lesson.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  if (!lessonsOnly) {
    if (sortedModules.length === 0) {
      if (moduleOrderEdit && moduleOrderEdit.orderedModuleIds.length === 0) {
        return (
          <p className="text-sm text-muted-foreground py-2">
            All modules are marked for removal. Accept to review deletion, or
            cancel.
          </p>
        );
      }
      return (
        <p className="text-sm text-muted-foreground py-2">
          No modules yet. Create a module to add lessons.
        </p>
      );
    }
  }

  const editingModules = Boolean(moduleOrderEdit);
  const showNestedLessons = Boolean(
    editingModules && moduleLessonEditsByModuleId
  );

  return (
    <div className="space-y-3">
      {sortedModules.map((mod, modIndex) => {
        const moduleNum = modIndex + 1;
        const isCollapsed = Boolean(collapsed[mod.id]);
        const mEdit = moduleLessonEditsByModuleId?.[mod.id];
        const sortedLessonRows = mEdit
          ? (() => {
              const byLid = new Map(mod.lessons.map((l) => [l.id, l]));
              if (mEdit.orderedLessonIds.length) {
                return mEdit.orderedLessonIds
                  .map((id) => byLid.get(id))
                  .filter((l): l is LessonMapLesson => l != null);
              }
              return [];
            })()
          : [...mod.lessons].sort((a, b) => a.number - b.number);

        const moduleHeader = (
          <div
            className={cn(
              "flex flex-1 items-center gap-1 px-1 py-2 text-sm min-w-0",
              !editingModules && "hover:bg-muted/50 transition-colors"
            )}
          >
            {editingModules && moduleOrderEdit ? (
              <span className="inline-flex shrink-0 items-center justify-center self-center p-0.5 text-base leading-none">
                <GripVertical
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden
                />
              </span>
            ) : null}
            {!editingModules ? (
              <button
                type="button"
                onClick={() => toggle(mod.id)}
                className="flex items-center justify-center px-1 border-r border-border/80 hover:bg-muted/60 transition-colors rounded-sm shrink-0"
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? "Expand module" : "Collapse module"}
              >
                {isCollapsed ? (
                  <ChevronRight className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <span className="w-7 shrink-0" aria-hidden />
            )}
            {editingModules ? (
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <span className="tabular-nums text-muted-foreground w-7 shrink-0">
                  {moduleNum}
                </span>
                <span className="font-medium truncate min-w-0 flex-1">
                  {mod.title}
                </span>
              </div>
            ) : (
              <Link
                href={`/dashboard/manager/courses/${courseId}/modules/${mod.id}`}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <span className="tabular-nums text-muted-foreground w-7 shrink-0">
                  {moduleNum}
                </span>
                <span className="font-medium truncate">{mod.title}</span>
              </Link>
            )}
            {editingModules && moduleOrderEdit?.onRemoveModuleId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label={`Remove module ${mod.title} from this course map`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  moduleOrderEdit?.onRemoveModuleId?.(mod.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        );

        return (
          <div
            key={mod.id}
            draggable={Boolean(editingModules && moduleOrderEdit)}
            onDragStart={
              editingModules && moduleOrderEdit
                ? (e) => {
                    e.dataTransfer.setData("text/plain", mod.id);
                    e.dataTransfer.effectAllowed = "move";
                  }
                : undefined
            }
            onDragOver={
              editingModules && moduleOrderEdit
                ? (e) => e.preventDefault()
                : undefined
            }
            onDrop={
              editingModules && moduleOrderEdit
                ? (e) => {
                    e.preventDefault();
                    const sid = e.dataTransfer.getData("text/plain");
                    moduleOrderEdit.onOrderChange(
                      reorderIds(
                        moduleOrderEdit.orderedModuleIds,
                        sid,
                        mod.id
                      )
                    );
                  }
                : undefined
            }
            className={cn(
              "rounded-lg border bg-muted/20 overflow-hidden",
              editingModules &&
                moduleOrderEdit &&
                "cursor-grab active:cursor-grabbing select-none"
            )}
          >
            <div className="flex items-stretch min-h-11">{moduleHeader}</div>

            {showNestedLessons && mEdit && (
              <ul className="border-t border-border/60 bg-background/50 py-2 pr-2 pl-2 space-y-1.5">
                {sortedLessonRows.length ? (
                  sortedLessonRows.map((lesson, li) => (
                    <li
                      key={lesson.id}
                      className="relative flex gap-0 pl-2 border-l-2 border-border ml-2"
                    >
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", lesson.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const sid = e.dataTransfer.getData("text/plain");
                          mEdit.onOrderChange(
                            reorderIds(
                              mEdit.orderedLessonIds,
                              sid,
                              lesson.id
                            )
                          );
                        }}
                        className={cn(
                          "flex flex-1 items-center gap-1 rounded-md border bg-card pl-1 pr-0 py-1.5 text-sm ml-2",
                          "cursor-grab active:cursor-grabbing select-none"
                        )}
                      >
                        <span className="inline-flex shrink-0 p-0.5">
                          <GripVertical
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-hidden
                          />
                        </span>
                        <span className="tabular-nums text-muted-foreground w-7 shrink-0">
                          {li + 1}
                        </span>
                        <span className="truncate min-w-0 flex-1">
                          {lesson.title}
                        </span>
                        {mEdit.onRemoveLessonId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Remove lesson ${lesson.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              mEdit.onRemoveLessonId?.(lesson.id);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="pl-4 text-xs text-muted-foreground py-1">
                    No lessons in this module. Add lessons from the module page,
                    or mark the module for removal.
                  </li>
                )}
              </ul>
            )}

            {!showNestedLessons && !isCollapsed && sortedLessonRows.length > 0 ? (
              <ul className="border-t border-border/60 bg-background/50 py-2 pr-2 pl-4 space-y-1.5">
                {sortedLessonRows.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="relative flex gap-0 pl-4 border-l-2 border-border ml-2"
                  >
                    <Link
                      href={`/dashboard/manager/courses/${courseId}/modules/${mod.id}/lessons/${lesson.id}`}
                      className={cn(
                        "flex flex-1 items-center gap-3 rounded-md border bg-card px-3 py-1.5 text-sm ml-2",
                        "hover:bg-accent/50 transition-colors"
                      )}
                    >
                      <span className="tabular-nums text-muted-foreground w-8 shrink-0">
                        {lesson.number}
                      </span>
                      <span className="truncate">{lesson.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {!showNestedLessons && !isCollapsed && sortedLessonRows.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-2 border-t border-border/60">
                No lessons in this module.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

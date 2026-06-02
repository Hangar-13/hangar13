"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BookOpen, FileText, GripVertical, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardTableShell } from "@/components/dashboard/page-shell";
import { cn } from "@/lib/utils";

export type TrainingPathMapItem = {
  itemId: string;
  sortOrder: number;
  scope: "course" | "module" | "lesson";
  title: string;
  /** e.g. parent course name for a module */
  context?: string;
  /** links for manager drill-down */
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
};

export type PathItemOrderEdit = {
  orderedItemIds: string[];
  onOrderChange: (ids: string[]) => void;
  onRemoveItemId?: (itemId: string) => void;
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

const scopeIcon = {
  course: BookOpen,
  module: Layers,
  lesson: FileText,
} as const;

const scopeLabel: Record<TrainingPathMapItem["scope"], string> = {
  course: "Course",
  module: "Module",
  lesson: "Lesson",
};

const scopeStyle =
  "inline-flex shrink-0 items-center rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

type Props = {
  items: TrainingPathMapItem[];
  itemOrderEdit?: PathItemOrderEdit;
};

export function TrainingPathMap({ items, itemOrderEdit }: Props) {
  const byId = useMemo(
    () => new Map(items.map((i) => [i.itemId, i])),
    [items]
  );

  const ordered = useMemo(() => {
    if (itemOrderEdit) {
      if (itemOrderEdit.orderedItemIds.length) {
        return itemOrderEdit.orderedItemIds
          .map((id) => byId.get(id))
          .filter((i): i is TrainingPathMapItem => i != null);
      }
      return [];
    }
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, byId, itemOrderEdit]);

  const editing = Boolean(itemOrderEdit);

  if (ordered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        {editing
          ? "All references removed. Accept to update the path, or cancel to undo."
          : "No items in this path yet. Use \"Add Training Content\" to add courses, modules, or lessons."}
      </p>
    );
  }

  return (
    <DashboardTableShell>
      <ul className="divide-y divide-border/25">
      {ordered.map((item) => {
        const Icon = scopeIcon[item.scope];
        const rowInner = (
          <div
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/25",
              editing && "cursor-grab active:cursor-grabbing select-none hover:bg-muted/20"
            )}
            draggable={editing}
            onDragStart={
              editing && itemOrderEdit
                ? (e) => {
                    e.dataTransfer.setData("text/plain", item.itemId);
                    e.dataTransfer.effectAllowed = "move";
                  }
                : undefined
            }
            onDragOver={
              editing && itemOrderEdit
                ? (e) => e.preventDefault()
                : undefined
            }
            onDrop={
              editing && itemOrderEdit
                ? (e) => {
                    e.preventDefault();
                    const sid = e.dataTransfer.getData("text/plain");
                    itemOrderEdit.onOrderChange(
                      reorderIds(
                        itemOrderEdit.orderedItemIds,
                        sid,
                        item.itemId
                      )
                    );
                  }
                : undefined
            }
          >
            {editing ? (
              <span className="inline-flex shrink-0 items-center justify-center text-base leading-none">
                <GripVertical
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden
                />
              </span>
            ) : null}
            <span className={scopeStyle}>
              <Icon className="size-3.5 mr-1" aria-hidden />
              {scopeLabel[item.scope]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{item.title}</div>
              {item.context ? (
                <div className="text-xs text-muted-foreground truncate">
                  {item.context}
                </div>
              ) : null}
            </div>
            {editing && itemOrderEdit?.onRemoveItemId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label={`Remove ${item.title} from path`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  itemOrderEdit?.onRemoveItemId?.(item.itemId);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        );

        if (editing) {
          return (
            <li key={item.itemId} className="list-none">
              {rowInner}
            </li>
          );
        }

        const href =
          item.scope === "course" && item.courseId
            ? `/dashboard/manager/courses/${item.courseId}`
            : item.scope === "module" && item.courseId && item.moduleId
              ? `/dashboard/manager/courses/${item.courseId}/modules/${item.moduleId}`
              : item.scope === "lesson" &&
                  item.courseId &&
                  item.moduleId &&
                  item.lessonId
                ? `/dashboard/manager/courses/${item.courseId}/modules/${item.moduleId}/lessons/${item.lessonId}`
                : null;

        return (
          <li key={item.itemId} className="list-none">
            {href ? (
              <Link href={href} className="block hover:opacity-95">
                {rowInner}
              </Link>
            ) : (
              rowInner
            )}
          </li>
        );
      })}
      </ul>
    </DashboardTableShell>
  );
}

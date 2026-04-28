"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  createManagerModule,
  deleteManagerLesson,
  deleteManagerModule,
  reorderCourseModules,
  reorderModuleLessons,
  updateCourseFields,
} from "@/app/actions/manager-training-content";
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
import { EditableInline } from "@/components/manager/editable-inline";
import { LessonMap, type LessonMapModule } from "@/components/manager/lesson-map";
import { ManagerContentLevelBar } from "@/components/manager/manager-content-level-bar";
import {
  DestructiveContentDeleteDialog,
  type DeleteLine,
} from "@/components/manager/destructive-content-delete-dialog";
import { VisibilitySectionEditor } from "@/components/manager/visibility-section-editor";
import type { CatalogVisibility } from "@/lib/catalog-visibility";

type Props = {
  course: {
    id: string;
    name: string;
    description: string | null;
    visibility: CatalogVisibility;
  };
  moduleTree: LessonMapModule[];
};

function lessonInTree(
  tree: LessonMapModule[],
  lessonId: string
): { moduleId: string; title: string } | null {
  for (const m of tree) {
    const hit = m.lessons.find((l) => l.id === lessonId);
    if (hit) return { moduleId: m.id, title: hit.title };
  }
  return null;
}

export function ManagerCourseDetailClient({ course, moduleTree }: Props) {
  const router = useRouter();
  const [moduleOpen, setModuleOpen] = useState(false);
  const [defaultHidden, setDefaultHidden] = useState(false);
  const [modTitle, setModTitle] = useState("");
  const [modDescription, setModDescription] = useState("");
  const [modError, setModError] = useState<string | null>(null);
  const [mapEditing, setMapEditing] = useState(false);
  const [moduleOrderDraft, setModuleOrderDraft] = useState<string[]>([]);
  const [lessonOrderByModuleId, setLessonOrderByModuleId] = useState<
    Record<string, string[]>
  >({});
  const [pendingRemoveModuleIds, setPendingRemoveModuleIds] = useState<
    string[]
  >([]);
  const [pendingRemoveLessonIds, setPendingRemoveLessonIds] = useState<
    string[]
  >([]);
  const [mapReorderError, setMapReorderError] = useState<string | null>(null);
  const [destructiveOpen, setDestructiveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const moduleById = useMemo(
    () => new Map(moduleTree.map((m) => [m.id, m])),
    [moduleTree]
  );

  useEffect(() => {
    if (defaultHidden) {
      setModTitle(`${course.name} module`);
      setModDescription("");
    }
  }, [defaultHidden, course.name]);

  function resetModuleForm() {
    setDefaultHidden(false);
    setModTitle("");
    setModDescription("");
    setModError(null);
  }

  function handleModuleDialog(open: boolean) {
    setModuleOpen(open);
    if (!open) resetModuleForm();
  }

  function beginModuleMapEdit() {
    const sorted = [...moduleTree].sort((a, b) => a.number - b.number);
    setModuleOrderDraft(sorted.map((m) => m.id));
    const next: Record<string, string[]> = {};
    for (const m of sorted) {
      next[m.id] = [...m.lessons]
        .sort((a, b) => a.number - b.number)
        .map((l) => l.id);
    }
    setLessonOrderByModuleId(next);
    setPendingRemoveModuleIds([]);
    setPendingRemoveLessonIds([]);
    setMapReorderError(null);
    setMapEditing(true);
  }

  function cancelModuleMapEdit() {
    setMapEditing(false);
    setModuleOrderDraft([]);
    setLessonOrderByModuleId({});
    setPendingRemoveModuleIds([]);
    setPendingRemoveLessonIds([]);
    setMapReorderError(null);
    setDestructiveOpen(false);
  }

  const removeModuleFromMap = useCallback(
    (moduleId: string) => {
      setModuleOrderDraft((prev) => prev.filter((id) => id !== moduleId));
      setPendingRemoveModuleIds((prev) =>
        prev.includes(moduleId) ? prev : [...prev, moduleId]
      );
      setPendingRemoveLessonIds((prev) => {
        const mod = moduleById.get(moduleId);
        if (!mod) return prev;
        const drop = new Set(mod.lessons.map((l) => l.id));
        return prev.filter((id) => !drop.has(id));
      });
      setLessonOrderByModuleId((prev) => {
        const n = { ...prev };
        delete n[moduleId];
        return n;
      });
    },
    [moduleById]
  );

  const removeLessonFromMap = useCallback((moduleId: string, lessonId: string) => {
    setLessonOrderByModuleId((prev) => ({
      ...prev,
      [moduleId]: (prev[moduleId] ?? []).filter((id) => id !== lessonId),
    }));
    setPendingRemoveLessonIds((prev) =>
      prev.includes(lessonId) ? prev : [...prev, lessonId]
    );
  }, []);

  const buildDestructiveDeleteLines = useCallback((): DeleteLine[] => {
    const lines: DeleteLine[] = [];
    const modRemoved = new Set(pendingRemoveModuleIds);
    for (const id of pendingRemoveModuleIds) {
      const m = moduleById.get(id);
      if (m) lines.push({ kind: "Module", label: m.title });
    }
    for (const lid of pendingRemoveLessonIds) {
      const info = lessonInTree(moduleTree, lid);
      if (info && !modRemoved.has(info.moduleId)) {
        lines.push({ kind: "Lesson", label: info.title });
      }
    }
    return lines;
  }, [
    moduleById,
    moduleTree,
    pendingRemoveLessonIds,
    pendingRemoveModuleIds,
  ]);

  const moduleLessonEditsByModuleId = useMemo(() => {
    if (!mapEditing) return undefined;
    const o: Record<
      string,
      {
        orderedLessonIds: string[];
        onOrderChange: (ids: string[]) => void;
        onRemoveLessonId: (lessonId: string) => void;
      }
    > = {};
    for (const mid of moduleOrderDraft) {
      o[mid] = {
        orderedLessonIds: lessonOrderByModuleId[mid] ?? [],
        onOrderChange: (ids) =>
          setLessonOrderByModuleId((p) => ({ ...p, [mid]: ids })),
        onRemoveLessonId: (lessonId) => removeLessonFromMap(mid, lessonId),
      };
    }
    return o;
  }, [
    mapEditing,
    moduleOrderDraft,
    lessonOrderByModuleId,
    removeLessonFromMap,
  ]);

  async function runPersistAfterDestructive(): Promise<boolean> {
    const removeModuleSet = new Set(pendingRemoveModuleIds);

    for (const mid of pendingRemoveModuleIds) {
      const r = await deleteManagerModule(mid);
      if (!r.ok) {
        setMapReorderError(r.error);
        return false;
      }
    }

    for (const lid of pendingRemoveLessonIds) {
      const loc = lessonInTree(moduleTree, lid);
      if (loc && removeModuleSet.has(loc.moduleId)) continue;
      const r = await deleteManagerLesson(lid);
      if (!r.ok) {
        setMapReorderError(r.error);
        return false;
      }
    }

    const rOrder = await reorderCourseModules(course.id, moduleOrderDraft);
    if (!rOrder.ok) {
      setMapReorderError(rOrder.error);
      return false;
    }

    for (const mid of moduleOrderDraft) {
      const ids = lessonOrderByModuleId[mid] ?? [];
      const rL = await reorderModuleLessons(mid, ids);
      if (!rL.ok) {
        setMapReorderError(rL.error);
        return false;
      }
    }
    return true;
  }

  function acceptModuleMapEdit() {
    setMapReorderError(null);
    if (buildDestructiveDeleteLines().length > 0) {
      setDestructiveOpen(true);
      return;
    }
    startTransition(async () => {
      const rOrder = await reorderCourseModules(course.id, moduleOrderDraft);
      if (!rOrder.ok) {
        setMapReorderError(rOrder.error);
        return;
      }
      for (const mid of moduleOrderDraft) {
        const ids = lessonOrderByModuleId[mid] ?? [];
        const rL = await reorderModuleLessons(mid, ids);
        if (!rL.ok) {
          setMapReorderError(rL.error);
          return;
        }
      }
      cancelModuleMapEdit();
      router.refresh();
    });
  }

  function submitModule() {
    setModError(null);
    const title = defaultHidden ? `${course.name} module` : modTitle.trim();
    const description = defaultHidden ? null : modDescription.trim() || null;
    if (!title) {
      setModError("Title is required.");
      return;
    }
    startTransition(async () => {
      const result = await createManagerModule({
        courseId: course.id,
        title,
        description,
        isHiddenFromUsers: defaultHidden,
      });
      if (!result.ok) {
        setModError(result.error);
        return;
      }
      handleModuleDialog(false);
      router.push(
        `/dashboard/manager/courses/${course.id}/modules/${result.moduleId}`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <ManagerContentLevelBar level="course" courseName={course.name} />
      <header className="flex flex-col gap-3">
        <div className="w-full min-w-0">
          <EditableInline
            label="Course title"
            value={course.name}
            displayClassName="text-2xl font-bold tracking-tight"
            placeholder="Course title"
            onSave={async (name) => {
              const r = await updateCourseFields(course.id, { name });
              if (r.ok) router.refresh();
              return r;
            }}
          />
        </div>
        <div className="w-full min-w-0 max-w-2xl">
          <EditableInline
            label="Course description"
            value={course.description ?? ""}
            multiline
            placeholder="Describe this course"
            onSave={async (description) => {
              const r = await updateCourseFields(course.id, {
                description: description.trim() || null,
              });
              if (r.ok) router.refresh();
              return r;
            }}
          />
        </div>
        <div className="w-full min-w-0 max-w-2xl border-t pt-4">
          <VisibilitySectionEditor
            entityKind="course"
            visibility={course.visibility}
            onSave={async (next) =>
              updateCourseFields(course.id, { visibility: next })
            }
            onSaved={() => router.refresh()}
          />
        </div>
      </header>

      <section className="space-y-4">
        <div className="group flex flex-wrap items-center gap-1 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Lesson Map</h2>
          {!mapEditing ? (
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
              onClick={beginModuleMapEdit}
              disabled={moduleTree.length < 1}
              aria-label="Edit lesson map"
              title={
                moduleTree.length < 1
                  ? "Add a module before editing the map"
                  : "Edit lesson map"
              }
            >
              <Pencil className="size-2" aria-hidden />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                onClick={acceptModuleMapEdit}
                disabled={pending}
              >
                {pending ? "Saving…" : "Accept"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelModuleMapEdit}
                disabled={pending}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
        {mapReorderError ? (
          <p className="text-sm text-destructive" role="alert">
            {mapReorderError}
          </p>
        ) : null}
        <LessonMap
          courseId={course.id}
          modules={moduleTree}
          moduleOrderEdit={
            mapEditing
              ? {
                  orderedModuleIds: moduleOrderDraft,
                  onOrderChange: setModuleOrderDraft,
                  onRemoveModuleId: removeModuleFromMap,
                }
              : undefined
          }
          moduleLessonEditsByModuleId={moduleLessonEditsByModuleId}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => setModuleOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          Create New Module
        </Button>
      </section>

      <DestructiveContentDeleteDialog
        open={destructiveOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDestructiveOpen(false);
            cancelModuleMapEdit();
          }
        }}
        title="Permanently delete content?"
        description="The following will be deleted and cannot be restored. Course structure will then be updated from your map."
        lines={buildDestructiveDeleteLines()}
        onConfirm={() => {
          setMapReorderError(null);
          startTransition(async () => {
            const ok = await runPersistAfterDestructive();
            if (!ok) return;
            cancelModuleMapEdit();
            router.refresh();
          });
        }}
        pending={pending}
      />

      <Dialog open={moduleOpen} onOpenChange={handleModuleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Module</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="flex items-start gap-3 text-sm leading-tight cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-input"
                checked={defaultHidden}
                onChange={(e) => setDefaultHidden(e.target.checked)}
              />
              <span>Make this a default module hidden from the user</span>
            </label>
            <div className="space-y-2">
              <Label htmlFor="mod-title">Title</Label>
              <Input
                id="mod-title"
                value={modTitle}
                onChange={(e) => setModTitle(e.target.value)}
                disabled={defaultHidden || pending}
                placeholder="Module title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-desc">Description</Label>
              <Textarea
                id="mod-desc"
                value={modDescription}
                onChange={(e) => setModDescription(e.target.value)}
                disabled={defaultHidden || pending}
                placeholder="Optional description"
                rows={3}
                className="resize-y min-h-[80px]"
              />
            </div>
            {modError ? (
              <p className="text-sm text-destructive" role="alert">
                {modError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleModuleDialog(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitModule} disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

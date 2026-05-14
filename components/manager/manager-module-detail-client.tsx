"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  convertSoleModuleToDefaultModule,
  createManagerLesson,
  deleteManagerLesson,
  reorderModuleLessons,
  updateModuleFields,
} from "@/app/actions/manager-training-content";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableInline } from "@/components/manager/editable-inline";
import { LessonMap, type LessonMapModule } from "@/components/manager/lesson-map";
import { ManagerContentLevelBar } from "@/components/manager/manager-content-level-bar";
import {
  DestructiveContentDeleteDialog,
  type DeleteLine,
} from "@/components/manager/destructive-content-delete-dialog";
import {
  AcsCodesPicker,
  type AcsCodePickerRow,
} from "@/components/manager/acs-codes-picker";
import {
  AtaChaptersPicker,
  type AtaChapterPickerRow,
} from "@/components/manager/ata-chapters-picker";
import {
  ManagerStringListEditor,
  stringsFromRows,
  type StringListRow,
} from "@/components/manager/manager-string-list-editor";
import { ManagerMarkdownTextarea } from "@/components/manager/manager-markdown-textarea";
import { AcsInclusionSwitchRow } from "@/components/manager/manager-acs-inclusion-toggle-row";

type Props = {
  course: { id: string; name: string };
  moduleIndex: number;
  module: {
    id: string;
    title: string;
    description: string | null;
    is_hidden_from_users: boolean;
  };
  moduleTree: LessonMapModule[];
  suggestedWeekNumber: number;
  isSoleModuleInCourse: boolean;
  acsCodeCatalog: AcsCodePickerRow[];
  ataChapterCatalog: AtaChapterPickerRow[];
};

export function ManagerModuleDetailClient({
  course,
  moduleIndex,
  module,
  moduleTree,
  suggestedWeekNumber,
  isSoleModuleInCourse,
  acsCodeCatalog,
  ataChapterCatalog,
}: Props) {
  const router = useRouter();
  const moduleTitleInBar =
    moduleIndex > 0 ? `${moduleIndex} - ${module.title}` : module.title;
  const [mapEditing, setMapEditing] = useState(false);
  const [lessonOrderDraft, setLessonOrderDraft] = useState<string[]>([]);
  const [pendingRemoveLessonIds, setPendingRemoveLessonIds] = useState<
    string[]
  >([]);
  const [mapReorderError, setMapReorderError] = useState<string | null>(null);
  const [destructiveOpen, setDestructiveOpen] = useState(false);
  const [defaultModuleWarningOpen, setDefaultModuleWarningOpen] =
    useState(false);
  const [defaultModuleError, setDefaultModuleError] = useState<string | null>(
    null
  );
  const [lessonOpen, setLessonOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [ataChapterIdsSelected, setAtaChapterIdsSelected] = useState<number[]>(
    []
  );
  const [learningObjectives, setLearningObjectives] = useState<StringListRow[]>(
    () => []
  );
  const [studyMaterials, setStudyMaterials] = useState("");
  const [practicalApplication, setPracticalApplication] = useState("");
  const [mentorDiscussionRows, setMentorDiscussionRows] = useState<
    StringListRow[]
  >(() => []);
  const [weeklyDeliverable, setWeeklyDeliverable] = useState("");
  const [talentLmsUnitId, setTalentLmsUnitId] = useState("");
  const [lessonHours, setLessonHours] = useState("0");
  const [acsCodesSelected, setAcsCodesSelected] = useState<number[]>([]);
  const [includeAcsCodes, setIncludeAcsCodes] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetLessonForm() {
    setTitle("");
    setAtaChapterIdsSelected([]);
    setLearningObjectives([]);
    setStudyMaterials("");
    setPracticalApplication("");
    setMentorDiscussionRows([]);
    setWeeklyDeliverable("");
    setTalentLmsUnitId("");
    setAcsCodesSelected([]);
    setIncludeAcsCodes(false);
    setLessonError(null);
  }

  function handleLessonDialog(open: boolean) {
    setLessonOpen(open);
    if (!open) resetLessonForm();
  }

  function beginLessonMapEdit() {
    const mod = moduleTree.find((m) => m.id === module.id);
    const sorted = [...(mod?.lessons ?? [])].sort(
      (a, b) => a.number - b.number
    );
    setLessonOrderDraft(sorted.map((l) => l.id));
    setPendingRemoveLessonIds([]);
    setMapReorderError(null);
    setMapEditing(true);
  }

  function cancelLessonMapEdit() {
    setMapEditing(false);
    setLessonOrderDraft([]);
    setPendingRemoveLessonIds([]);
    setMapReorderError(null);
    setDestructiveOpen(false);
  }

  function removeLessonFromMap(lessonId: string) {
    setLessonOrderDraft((prev) => prev.filter((id) => id !== lessonId));
    setPendingRemoveLessonIds((prev) =>
      prev.includes(lessonId) ? prev : [...prev, lessonId]
    );
  }

  const destructiveDeleteLines: DeleteLine[] = [];
  for (const id of pendingRemoveLessonIds) {
    const mFound = moduleTree.find((m) => m.id === module.id);
    const les = mFound?.lessons.find((l) => l.id === id);
    if (les) destructiveDeleteLines.push({ kind: "Lesson", label: les.title });
  }

  async function persistLessonMapWithDeletes(): Promise<boolean> {
    for (const lid of pendingRemoveLessonIds) {
      const r = await deleteManagerLesson(lid);
      if (!r.ok) {
        setMapReorderError(r.error);
        return false;
      }
    }
    const r = await reorderModuleLessons(module.id, lessonOrderDraft);
    if (!r.ok) {
      setMapReorderError(r.error);
      return false;
    }
    return true;
  }

  function acceptLessonMapEdit() {
    setMapReorderError(null);
    if (pendingRemoveLessonIds.length > 0) {
      setDestructiveOpen(true);
      return;
    }
    startTransition(async () => {
      const r = await reorderModuleLessons(module.id, lessonOrderDraft);
      if (!r.ok) {
        setMapReorderError(r.error);
        return;
      }
      cancelLessonMapEdit();
      router.refresh();
    });
  }

  function submitLesson() {
    setLessonError(null);
    const parsedHours = Number.parseFloat(lessonHours);
    const hours = Number.isFinite(parsedHours) ? parsedHours : 0;
    startTransition(async () => {
      const result = await createManagerLesson({
        moduleId: module.id,
        weekNumber: suggestedWeekNumber,
        title,
        hours,
        ataChapterIds: ataChapterIdsSelected,
        acsCodes: includeAcsCodes ? acsCodesSelected : [],
        learningObjectives: stringsFromRows(learningObjectives),
        studyMaterials: studyMaterials.trim() || null,
        practicalApplication: practicalApplication.trim() || null,
        mentorDiscussionQuestions: stringsFromRows(mentorDiscussionRows),
        weeklyDeliverable: weeklyDeliverable.trim() || null,
        talentLmsUnitId: talentLmsUnitId.trim() || null,
      });
      if (!result.ok) {
        setLessonError(result.error);
        return;
      }
      handleLessonDialog(false);
      router.push(
        `/dashboard/manager/courses/${course.id}/modules/${module.id}/lessons/${result.lessonId}`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <ManagerContentLevelBar
        level="module"
        courseId={course.id}
        courseName={course.name}
        moduleTitle={moduleTitleInBar}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3 min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-muted-foreground shrink-0">
              {moduleIndex > 0 ? `${moduleIndex} -` : null}
            </span>
            <div className="min-w-0 flex-1">
              <EditableInline
                label="Module title"
                value={module.title}
                displayClassName="text-2xl font-bold tracking-tight"
                placeholder="Module title"
                onSave={async (t) => {
                  const r = await updateModuleFields(module.id, { title: t });
                  if (r.ok) router.refresh();
                  return r;
                }}
              />
            </div>
          </div>
          {module.is_hidden_from_users ? (
            <p className="text-sm text-amber-700 dark:text-amber-400/90 max-w-2xl">
              This is a default module and will not be displayed to users; lessons
              will appear directly under the course.
            </p>
          ) : null}
          <div className="w-full min-w-0 max-w-2xl">
            <EditableInline
              label="Module description"
              value={module.description ?? ""}
              multiline
              placeholder="Optional description"
              onSave={async (d) => {
                const r = await updateModuleFields(module.id, {
                  description: d.trim() || null,
                });
                if (r.ok) router.refresh();
                return r;
              }}
            />
          </div>
          {isSoleModuleInCourse && !module.is_hidden_from_users ? (
            <div className="pt-2">
              <label
                htmlFor="sole-module-default-checkbox"
                className="flex cursor-pointer items-start gap-3 text-sm leading-snug"
              >
                <input
                  id="sole-module-default-checkbox"
                  type="checkbox"
                  className="mt-1 rounded border-input"
                  checked={false}
                  aria-label="Make this a default module hidden from the user (opens confirmation)"
                  onChange={() => setDefaultModuleWarningOpen(true)}
                />
                <span>
                  Make this a default module hidden from the user
                </span>
              </label>
            </div>
          ) : null}
        </div>
        <Button asChild variant="outline" className="shrink-0 self-start">
          <Link href={`/dashboard/manager/courses/${course.id}`}>
            Back to Course
          </Link>
        </Button>
      </div>

      <section className="space-y-4">
        <div className="group flex flex-wrap items-center gap-1 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Lesson Map</h2>
          {!mapEditing ? (
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
              onClick={beginLessonMapEdit}
              disabled={
                (moduleTree.find((m) => m.id === module.id)?.lessons.length ??
                  0) === 0
              }
              aria-label="Edit lesson map"
              title={
                (moduleTree.find((m) => m.id === module.id)?.lessons.length ??
                  0) === 0
                  ? "Add a lesson before editing the map"
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
                onClick={acceptLessonMapEdit}
                disabled={pending}
              >
                {pending ? "Saving…" : "Accept"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelLessonMapEdit}
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
          lessonsOnly
          moduleId={module.id}
          lessonOrderEdit={
            mapEditing
              ? {
                  orderedLessonIds: lessonOrderDraft,
                  onOrderChange: setLessonOrderDraft,
                  onRemoveLessonId: removeLessonFromMap,
                }
              : undefined
          }
        />
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => handleLessonDialog(true)}
        >
          <Plus className="size-4" aria-hidden />
          Create New Lesson
        </Button>
      </section>

      <DestructiveContentDeleteDialog
        open={destructiveOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDestructiveOpen(false);
            cancelLessonMapEdit();
          }
        }}
        title="Permanently delete lessons?"
        description="The following will be deleted and cannot be restored. Order will then be updated from your map."
        lines={destructiveDeleteLines}
        onConfirm={() => {
          setMapReorderError(null);
          startTransition(async () => {
            const ok = await persistLessonMapWithDeletes();
            if (!ok) return;
            cancelLessonMapEdit();
            router.refresh();
          });
        }}
        pending={pending}
      />

      <Dialog
        open={defaultModuleWarningOpen}
        onOpenChange={(open) => {
          setDefaultModuleWarningOpen(open);
          if (!open) setDefaultModuleError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert to default module?</DialogTitle>
            <DialogDescription className="text-left text-foreground pt-2 leading-relaxed">
              Making this module a default module will change the title, remove the
              description, and make this module transparent to users; they will only
              see the lessons in the module.
            </DialogDescription>
          </DialogHeader>
          {defaultModuleError ? (
            <p className="text-sm text-destructive" role="alert">
              {defaultModuleError}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDefaultModuleWarningOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDefaultModuleError(null);
                startTransition(async () => {
                  const r = await convertSoleModuleToDefaultModule(module.id);
                  if (!r.ok) {
                    setDefaultModuleError(r.error);
                    return;
                  }
                  setDefaultModuleWarningOpen(false);
                  router.refresh();
                });
              }}
              disabled={pending}
            >
              {pending ? "Applying…" : "Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lessonOpen} onOpenChange={handleLessonDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Lesson</DialogTitle>
          </DialogHeader>
          <div className="divide-y divide-border">
            <div className="flex min-w-0 flex-row flex-wrap items-center gap-3 py-3">
              <Label
                htmlFor="les-title"
                className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
              >
                Title
              </Label>
              <Input
                id="les-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={pending}
                placeholder="Lesson title"
                className="min-w-0 flex-1"
              />
            </div>
            <div className="flex min-w-0 flex-row flex-wrap items-center gap-3 py-3">
              <Label
                htmlFor="les-hours"
                className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
              >
                Expected hours
              </Label>
              <Input
                id="les-hours"
                type="number"
                min={0}
                max={99999}
                step={0.25}
                value={lessonHours}
                onChange={(e) => setLessonHours(e.target.value)}
                disabled={pending}
                className="w-32"
                aria-label="Expected hours for this lesson"
              />
            </div>
            <div className="min-w-0 space-y-2 py-3">
              <AtaChaptersPicker
                chapters={ataChapterCatalog}
                selectedIds={ataChapterIdsSelected}
                onChange={setAtaChapterIdsSelected}
                disabled={pending}
                idPrefix="new-lesson-ata"
                sectionLabel="ATA Chapter"
              />
            </div>
            <div className="min-w-0 space-y-3 py-3">
              <AcsInclusionSwitchRow
                id="new-lesson-include-acs"
                include={includeAcsCodes}
                onChange={setIncludeAcsCodes}
                disabled={pending}
              />
              {includeAcsCodes ? (
                <AcsCodesPicker
                  codes={acsCodeCatalog}
                  selectedIds={acsCodesSelected}
                  onChange={setAcsCodesSelected}
                  disabled={pending}
                  idPrefix="new-lesson"
                  sectionLabel="ACS Codes"
                />
              ) : null}
            </div>
            <div className="min-w-0 space-y-2 py-3">
              <Label className="text-sm font-medium text-muted-foreground">
                Learning Objectives
              </Label>
              <ManagerStringListEditor
                idPrefix="new-lesson-lo"
                rows={learningObjectives}
                onChange={setLearningObjectives}
                disabled={pending}
                addLabel="Add objective"
                itemPlaceholder="Objective text"
              />
            </div>
            <div className="min-w-0 space-y-2 py-3">
              <h3 className="text-base font-semibold tracking-tight">
                TalentLMS Unit
              </h3>
              <Input
                id="les-talent-unit"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="4 digit unit id"
                aria-label="TalentLMS Unit"
                value={talentLmsUnitId}
                onChange={(e) => setTalentLmsUnitId(e.target.value)}
                disabled={pending}
                className="max-w-xs font-mono text-sm tabular-nums"
              />
            </div>
            <div className="min-w-0 space-y-2 py-3">
              <Label
                htmlFor="les-study"
                className="text-sm font-medium text-muted-foreground"
              >
                Study Materials
              </Label>
              <ManagerMarkdownTextarea
                id="les-study"
                value={studyMaterials}
                onChange={setStudyMaterials}
                disabled={pending}
                aria-label="Study Materials"
                rows={5}
              />
            </div>
            <div className="min-w-0 space-y-2 py-3">
              <Label
                htmlFor="les-prac"
                className="text-sm font-medium text-muted-foreground"
              >
                Practical Application
              </Label>
              <ManagerMarkdownTextarea
                id="les-prac"
                value={practicalApplication}
                onChange={setPracticalApplication}
                disabled={pending}
                aria-label="Practical Application"
                rows={5}
              />
            </div>
            <div className="min-w-0 space-y-2 py-3">
              <Label className="text-sm font-medium text-muted-foreground">
                Mentor Discussion Questions
              </Label>
              <ManagerStringListEditor
                idPrefix="new-lesson-mentor"
                rows={mentorDiscussionRows}
                onChange={setMentorDiscussionRows}
                disabled={pending}
                addLabel="Add question"
                itemPlaceholder="Question text"
              />
            </div>
            <div className="min-w-0 space-y-2 py-3">
              <Label
                htmlFor="les-deliver"
                className="text-sm font-medium text-muted-foreground"
              >
                Weekly Deliverable
              </Label>
              <ManagerMarkdownTextarea
                id="les-deliver"
                value={weeklyDeliverable}
                onChange={setWeeklyDeliverable}
                disabled={pending}
                aria-label="Weekly Deliverable"
                rows={4}
                minHeightClassName="min-h-[100px]"
              />
            </div>
            {lessonError ? (
              <p
                className="text-sm text-destructive py-3"
                role="alert"
              >
                {lessonError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleLessonDialog(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitLesson}
              disabled={pending || !title.trim()}
            >
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

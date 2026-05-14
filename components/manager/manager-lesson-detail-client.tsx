"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateLessonFields } from "@/app/actions/manager-training-content";
import { Button } from "@/components/ui/button";
import { EditableInline, EditableLessonHours } from "@/components/manager/editable-inline";
import { EditableMarkdownField } from "@/components/manager/editable-markdown-field";
import { ManagerContentLevelBar } from "@/components/manager/manager-content-level-bar";
import { LessonAcsCodesInclusionSection } from "@/components/manager/lesson-acs-codes-inclusion-section";
import { ManagerLessonAtaChaptersSection } from "@/components/manager/manager-lesson-ata-chapters-section";
import { ManagerLessonStringListSection } from "@/components/manager/manager-lesson-string-list-section";
import type { AcsCodePickerRow } from "@/components/manager/acs-codes-picker";
import type { AtaChapterPickerRow } from "@/components/manager/ata-chapters-picker";

export type LessonDetail = {
  id: string;
  number: number;
  title: string;
  hours: number;
  ata_chapter_ids: number[];
  acs_codes: number[];
  learning_objectives: string[];
  talent_lms_unit_id: string | null;
  study_materials: string | null;
  practical_application: string | null;
  mentor_discussion_questions: string[];
  weekly_deliverable: string | null;
};

type Props = {
  courseId: string;
  courseName: string;
  moduleId: string;
  moduleTitle: string;
  lesson: LessonDetail;
  lessonTitleInBar: string;
  acsCodeCatalog: AcsCodePickerRow[];
  ataChapterCatalog: AtaChapterPickerRow[];
};

export function ManagerLessonDetailClient({
  courseId,
  courseName,
  moduleId,
  moduleTitle,
  lesson,
  lessonTitleInBar,
  acsCodeCatalog,
  ataChapterCatalog,
}: Props) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <ManagerContentLevelBar
        level="lesson"
        courseId={courseId}
        courseName={courseName}
        moduleId={moduleId}
        moduleTitle={moduleTitle}
        lessonTitle={lessonTitleInBar}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-6 min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-muted-foreground shrink-0">
              {lesson.number} -
            </span>
            <div className="min-w-0 flex-1">
              <EditableInline
                label="Lesson title"
                value={lesson.title}
                displayClassName="text-2xl font-bold tracking-tight"
                placeholder="Lesson title"
                onSave={async (title) => {
                  const r = await updateLessonFields(lesson.id, { title });
                  if (r.ok) router.refresh();
                  return r;
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="text-muted-foreground shrink-0">Planned time</span>
            <EditableLessonHours
              label="Lesson planned hours"
              value={lesson.hours}
              onSave={async (hours) => {
                const r = await updateLessonFields(lesson.id, { hours });
                if (r.ok) router.refresh();
                return r;
              }}
            />
          </div>

          <div className="space-y-6">
            <ManagerLessonAtaChaptersSection
              lessonId={lesson.id}
              ataChapterIds={lesson.ata_chapter_ids}
              catalog={ataChapterCatalog}
              onSaved={() => router.refresh()}
            />

            <LessonAcsCodesInclusionSection
              key={lesson.id}
              lessonId={lesson.id}
              acsCodes={lesson.acs_codes}
              catalog={acsCodeCatalog}
              onSaved={() => router.refresh()}
              switchId="lesson-include-acs"
            />

            <ManagerLessonStringListSection
              lessonId={lesson.id}
              label="Learning Objectives"
              field="learning_objectives"
              items={lesson.learning_objectives}
              onSaved={() => router.refresh()}
              addItemLabel="Add objective"
              itemPlaceholder="Objective text"
              idPrefix="lesson-lo"
            />

            <div className="max-w-3xl space-y-2">
              <h3 className="text-base font-semibold tracking-tight">
                TalentLMS Unit
              </h3>
              <EditableInline
                label="TalentLMS Unit"
                value={lesson.talent_lms_unit_id ?? ""}
                displayClassName="text-sm font-mono tabular-nums"
                placeholder="No TalentLMS lesson specified"
                editPlaceholder="e.g. 2065"
                onSave={async (v) => {
                  const r = await updateLessonFields(lesson.id, {
                    talent_lms_unit_id: v.trim() || null,
                  });
                  if (r.ok) router.refresh();
                  return r;
                }}
              />
            </div>

            <EditableMarkdownField
              id="lesson-study-materials"
              title="Study Materials"
              value={lesson.study_materials ?? ""}
              placeholder="Optional"
              onSave={async (v) => {
                const r = await updateLessonFields(lesson.id, {
                  study_materials: v.trim() || null,
                });
                if (r.ok) router.refresh();
                return r;
              }}
            />

            <EditableMarkdownField
              id="lesson-practical-application"
              title="Practical Application"
              value={lesson.practical_application ?? ""}
              placeholder="Optional"
              onSave={async (v) => {
                const r = await updateLessonFields(lesson.id, {
                  practical_application: v.trim() || null,
                });
                if (r.ok) router.refresh();
                return r;
              }}
            />

            <ManagerLessonStringListSection
              lessonId={lesson.id}
              label="Mentor Discussion Questions"
              field="mentor_discussion_questions"
              items={lesson.mentor_discussion_questions}
              onSaved={() => router.refresh()}
              addItemLabel="Add question"
              itemPlaceholder="Question text"
              idPrefix="lesson-mentor"
            />

            <EditableMarkdownField
              id="lesson-weekly-deliverable"
              title="Weekly Deliverable"
              value={lesson.weekly_deliverable ?? ""}
              placeholder="Optional"
              onSave={async (v) => {
                const r = await updateLessonFields(lesson.id, {
                  weekly_deliverable: v.trim() || null,
                });
                if (r.ok) router.refresh();
                return r;
              }}
            />
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0 self-start">
          <Link
            href={`/dashboard/manager/courses/${courseId}/modules/${moduleId}`}
          >
            Back to Module
          </Link>
        </Button>
      </div>
    </div>
  );
}

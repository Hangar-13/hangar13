"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CourseworkCourse,
  CourseworkLesson,
} from "@/lib/student-coursework";

function LessonRow({
  lesson,
  studentName,
}: {
  lesson: CourseworkLesson;
  studentName: string;
}) {
  const reviewHref =
    lesson.awaitingReview && lesson.submissionId
      ? `/dashboard/mentor/review-submissions?student=${encodeURIComponent(studentName)}&openSubmission=${lesson.submissionId}`
      : null;
  const content = (
    <>
      <span className="min-w-0">
        <span className="truncate">{lesson.title}</span>
        {lesson.awaitingReview ? (
          <span className="ml-2 font-medium text-primary">Awaiting review</span>
        ) : null}
      </span>
      {lesson.revision ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          rev {lesson.revision}
        </span>
      ) : null}
    </>
  );

  if (!reviewHref) {
    return (
      <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">{content}</li>
    );
  }

  return (
    <li>
      <Link
        href={reviewHref}
        className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40"
      >
        {content}
      </Link>
    </li>
  );
}

function CourseBlock({
  course,
  studentName,
}: {
  course: CourseworkCourse;
  studentName: string;
}) {
  const [open, setOpen] = useState(false);
  const awaiting = course.modules.flatMap((mod) =>
    mod.lessons.filter((lesson) => lesson.awaitingReview)
  );

  return (
    <div className="rounded-md ring-1 ring-black/[0.04]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
            aria-hidden
          />
          <span className="truncate text-sm font-medium">{course.name}</span>
        </span>
        {course.versionLabel ? (
          <span
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
            title={course.versionMixed ? "Some lessons from older versions" : undefined}
          >
            {course.versionLabel}
            {course.versionMixed ? "*" : null}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/25 px-2 py-2">
          {course.modules.map((mod) =>
            mod.hidden ? (
              <ul key={mod.id} className="divide-y divide-border/25">
                {mod.lessons.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} studentName={studentName} />
                ))}
              </ul>
            ) : (
              <div key={mod.id} className="space-y-1">
                <p className="px-3 text-xs font-medium text-muted-foreground">{mod.title}</p>
                <ul className="divide-y divide-border/25">
                  {mod.lessons.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} studentName={studentName} />
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      ) : awaiting.length > 0 ? (
        <ul className="divide-y divide-border/25 border-t border-border/25">
          {awaiting.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} studentName={studentName} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function StudentCoursework({
  courses,
  studentName,
}: {
  courses: CourseworkCourse[];
  studentName: string;
}) {
  if (courses.length === 0) {
    return <p className="text-sm text-muted-foreground">No courses in this training yet.</p>;
  }

  return (
    <div className="space-y-2">
      {courses.map((course) => (
        <CourseBlock key={course.id} course={course} studentName={studentName} />
      ))}
    </div>
  );
}

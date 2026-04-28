"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Level = "course" | "module" | "lesson" | "trainingPath";

const levelStyles: Record<Level, { label: string; pill: string }> = {
  course: {
    label: "Course",
    pill:
      "border-sky-300/80 bg-sky-100 text-sky-950 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-100",
  },
  module: {
    label: "Module",
    pill:
      "border-violet-300/80 bg-violet-100 text-violet-950 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-100",
  },
  lesson: {
    label: "Lesson",
    pill:
      "border-teal-300/80 bg-teal-100 text-teal-950 dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-100",
  },
  trainingPath: {
    label: "Training path",
    pill:
      "border-amber-300/80 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100",
  },
};

type CourseBar = { level: "course"; courseName: string };

type ModuleBar = {
  level: "module";
  courseId: string;
  courseName: string;
  moduleTitle: string;
};

type LessonBar = {
  level: "lesson";
  courseId: string;
  courseName: string;
  moduleId: string;
  moduleTitle: string;
  lessonTitle: string;
};

type TrainingPathBar = { level: "trainingPath"; pathName: string };

export type ManagerContentLevelBarProps =
  | CourseBar
  | ModuleBar
  | LessonBar
  | TrainingPathBar;

export function ManagerContentLevelBar(props: ManagerContentLevelBarProps) {
  const { level } = props;
  const cfg = levelStyles[level];

  const breadcrumb =
    level === "trainingPath" ? (
      <nav
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        aria-label="Location"
      >
        <Link
          href="/dashboard/manager/content"
          className="hover:text-foreground hover:underline"
        >
          Content
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
        <span
          className="truncate max-w-[min(100%,20rem)] font-medium text-foreground"
          title={props.pathName}
        >
          {props.pathName}
        </span>
      </nav>
    ) : level === "course" ? (
      <nav
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        aria-label="Location"
      >
        <Link
          href="/dashboard/manager/content"
          className="hover:text-foreground hover:underline"
        >
          Content
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
        <span
          className="truncate max-w-[min(100%,20rem)] font-medium text-foreground"
          title={props.courseName}
        >
          {props.courseName}
        </span>
      </nav>
    ) : level === "module" ? (
      <nav
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        aria-label="Location"
      >
        <Link
          href="/dashboard/manager/content"
          className="shrink-0 hover:text-foreground hover:underline"
        >
          Content
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
        <Link
          href={`/dashboard/manager/courses/${props.courseId}`}
          className="truncate max-w-[min(100%,12rem)] hover:text-foreground hover:underline"
        >
          {props.courseName}
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
        <span
          className="truncate max-w-[min(100%,18rem)] font-medium text-foreground"
          title={props.moduleTitle}
        >
          {props.moduleTitle}
        </span>
      </nav>
    ) : (
      <nav
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        aria-label="Location"
      >
        <Link
          href="/dashboard/manager/content"
          className="shrink-0 hover:text-foreground hover:underline"
        >
          Content
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
        <Link
          href={`/dashboard/manager/courses/${props.courseId}`}
          className="truncate max-w-[min(100%,12rem)] hover:text-foreground hover:underline"
        >
          {props.courseName}
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
        <Link
          href={`/dashboard/manager/courses/${props.courseId}/modules/${props.moduleId}`}
          className="truncate max-w-[min(100%,12rem)] hover:text-foreground hover:underline"
        >
          {props.moduleTitle}
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
        <span
          className="truncate max-w-[min(100%,16rem)] font-medium text-foreground"
          title={props.lessonTitle}
        >
          {props.lessonTitle}
        </span>
      </nav>
    );

  return (
    <div className="border-b border-border pb-5 mb-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest",
            cfg.pill
          )}
        >
          {cfg.label}
        </span>
        <div className="min-w-0 flex-1">{breadcrumb}</div>
      </div>
    </div>
  );
}

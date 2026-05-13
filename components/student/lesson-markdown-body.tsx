"use client";

import { MarkdownContent } from "@/components/ui/markdown-content";
import { useTalentLmsEmbedOpener } from "@/components/student/talent-lms-lesson-embed";

type Props = { markdown: string; emptyMessage?: string };

/**
 * Renders stored lesson body markdown (study materials, practical, deliverable) for learners.
 */
export function LessonMarkdownBody({ markdown, emptyMessage }: Props) {
  const openTalentLesson = useTalentLmsEmbedOpener();

  if (!markdown?.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyMessage ?? "No content for this section."}
      </p>
    );
  }
  return (
    <MarkdownContent
      markdown={markdown}
      className="text-muted-foreground"
      onTalentLmsHttpsClickAction={openTalentLesson ?? undefined}
    />
  );
}

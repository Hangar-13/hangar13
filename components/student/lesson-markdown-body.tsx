"use client";

import { MarkdownContent } from "@/components/ui/markdown-content";
import { useTalentLmsWebviewOpener } from "@/components/student/talent-lms-webview";

type Props = {
  markdown: string;
  emptyMessage?: string;
  /** From `TALENTLMS_SUBDOMAIN`; enables SSO-first Talent links on the student training page. */
  talentPortalOrigin?: string | null;
  /** Opens Talent SSO URLs in Hangar’s fullscreen iframe dialog (training page only). */
  talentEmbedWebview?: boolean;
};

/**
 * Renders stored lesson body markdown (study materials, practical, deliverable) for learners.
 */
export function LessonMarkdownBody({
  markdown,
  emptyMessage,
  talentPortalOrigin,
  talentEmbedWebview = false,
}: Props) {
  const openWebview = useTalentLmsWebviewOpener();

  const panelTalent =
    Boolean(
      talentEmbedWebview &&
        openWebview &&
        typeof talentPortalOrigin !== "undefined"
    );

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
      talentPortalOrigin={talentPortalOrigin}
      talentOpenInWebview={panelTalent}
      onTalentWebviewOpenAction={
        panelTalent && openWebview ? openWebview : undefined
      }
    />
  );
}

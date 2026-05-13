"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OpenFn = (href: string) => void;

const TalentLmsEmbedOpenerCtx = createContext<OpenFn | null>(null);

export function useTalentLmsEmbedOpener(): OpenFn | null {
  return useContext(TalentLmsEmbedOpenerCtx);
}

function navigateToTalentLesson(href: string): void {
  const u = href.trim();
  if (!u) return;
  window.location.assign(u);
}

/**
 * Sends learners to Talent on Talent’s origin (same tab). Embedding Talent in Hangar fails in
 * practice (cookies / CSP / SPA); iframe was removed for direct navigation instead.
 */
export function TalentLmsLessonEmbedProvider({ children }: { children: ReactNode }) {
  const open = useCallback((href: string) => {
    navigateToTalentLesson(href);
  }, []);

  return (
    <TalentLmsEmbedOpenerCtx.Provider value={open}>{children}</TalentLmsEmbedOpenerCtx.Provider>
  );
}

/** Primary CTA for the weekly lesson Talent URL detected from markdown copy. */
export function TalentLmsStartLessonButton({
  href,
  className,
}: {
  href: string | null;
  /** Use on tinted hero cards (`text-primary-foreground` parent). */
  className?: string;
}) {
  const trimmed = href?.trim();
  if (!trimmed) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className={cn(
        "shrink-0 gap-2 border border-primary/20 bg-background/80 text-primary hover:bg-background",
        className
      )}
      onClick={() => navigateToTalentLesson(trimmed)}
    >
      <PlayCircle className="mr-2 h-5 w-5" />
      Start lesson
    </Button>
  );
}

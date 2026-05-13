"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { talentLmsSpInitiatedSsoLaunchUrl } from "@/lib/talentlms/sso-launch-url";
import { cn } from "@/lib/utils";

type OpenFn = (href: string) => void;

type TalentLmsLaunchContextValue = Readonly<{
  openTalentLesson: OpenFn;
}>;

const TalentLmsLaunchCtx = createContext<TalentLmsLaunchContextValue | null>(null);

export function useTalentLmsEmbedOpener(): OpenFn | null {
  return useContext(TalentLmsLaunchCtx)?.openTalentLesson ?? null;
}

/**
 * Sends learners through Talent SP-initiated SAML (`/index/ssologin/service:saml`) on the tenant
 * host from `talentPortalOrigin` when markdown URLs point at www / wrong host.
 */
export function TalentLmsLessonEmbedProvider({
  children,
  talentPortalOrigin = null,
}: {
  children: ReactNode;
  /** From server env `TALENTLMS_SUBDOMAIN`, e.g. `https://myorg.talentlms.com` */
  talentPortalOrigin?: string | null;
}) {
  const value = useMemo<TalentLmsLaunchContextValue>(
    () => ({
      openTalentLesson: (href: string) => {
        const u = href.trim();
        if (!u) return;
        window.location.assign(
          talentLmsSpInitiatedSsoLaunchUrl(u, { portalOrigin: talentPortalOrigin })
        );
      },
    }),
    [talentPortalOrigin]
  );

  return (
    <TalentLmsLaunchCtx.Provider value={value}>{children}</TalentLmsLaunchCtx.Provider>
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
  const ctx = useContext(TalentLmsLaunchCtx);
  if (!trimmed || !ctx?.openTalentLesson) {
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
      onClick={() => ctx.openTalentLesson(trimmed)}
    >
      <PlayCircle className="mr-2 h-5 w-5" />
      Start lesson
    </Button>
  );
}

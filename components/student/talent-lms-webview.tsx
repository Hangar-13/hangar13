"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TalentLmsWebviewOpenPayload } from "@/lib/talentlms/webview-payload";
import { cn } from "@/lib/utils";

export type TalentLmsWebviewOpenFn = (payload: TalentLmsWebviewOpenPayload) => void;

const TalentLmsWebviewCtx = createContext<TalentLmsWebviewOpenFn | null>(null);

export function useTalentLmsWebviewOpener(): TalentLmsWebviewOpenFn | null {
  return useContext(TalentLmsWebviewCtx);
}

export function TalentLmsWebviewProvider({ children }: { children: ReactNode }) {
  const [openState, setOpenState] = useState<TalentLmsWebviewOpenPayload | null>(null);

  const open = useCallback((payload: TalentLmsWebviewOpenPayload) => {
    if (!payload.ssoLaunchUrl.trim() || !payload.originalLessonUrl.trim()) return;
    setOpenState(payload);
  }, []);

  const close = useCallback(() => setOpenState(null), []);

  const ctxValue = useMemo(() => open, [open]);

  return (
    <TalentLmsWebviewCtx.Provider value={ctxValue}>
      {children}
      <TalentLmsWebviewDialog state={openState} onDismiss={close} />
    </TalentLmsWebviewCtx.Provider>
  );
}

function TalentLmsWebviewDialog({
  state,
  onDismiss,
}: {
  state: TalentLmsWebviewOpenPayload | null;
  onDismiss: () => void;
}) {
  const show = !!state;

  return (
    <Dialog
      open={show}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent
        className={cn(
          "max-w-[calc(100vw-1rem)] w-full sm:max-w-[min(calc(100vw-2rem),1200px)]",
          "h-[calc(100dvh-4rem)] sm:h-[min(90dvh,900px)]",
          "gap-0 p-0 overflow-hidden flex flex-col",
          "top-[50%] translate-y-[-50%]"
        )}
      >
        <DialogHeader className="flex-shrink-0 space-y-3 border-b border-border px-6 py-5 pr-14">
          <DialogTitle>TalentLMS</DialogTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
              Embedded Talent often breaks SAML or cookies inside this panel. Prefer opening the lesson
              in a full tab—you’ll stay on Hangar here. Use SSO in a tab only if you need to sign in
              first or the lesson link alone asks for SAML.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              {state ? (
                <>
                  <Button variant="default" size="sm" className="h-8" asChild>
                    <a
                      href={state.originalLessonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Open lesson in new tab
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" asChild>
                    <a
                      href={state.ssoLaunchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      SSO (new tab)
                    </a>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <div className="relative flex-1 min-h-0 bg-muted/40">
          {state ? (
            <iframe
              title="TalentLMS"
              src={state.ssoLaunchUrl}
              className="absolute inset-0 size-full border-0"
              allow="fullscreen; clipboard-write"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

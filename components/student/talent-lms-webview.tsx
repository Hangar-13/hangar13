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
import { cn } from "@/lib/utils";

type OpenFn = (ssoLaunchUrl: string) => void;

const TalentLmsWebviewCtx = createContext<OpenFn | null>(null);

export function useTalentLmsWebviewOpener(): OpenFn | null {
  return useContext(TalentLmsWebviewCtx);
}

export function TalentLmsWebviewProvider({ children }: { children: ReactNode }) {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  const open = useCallback((url: string) => {
    const u = url.trim();
    if (u) setIframeSrc(u);
  }, []);

  const close = useCallback(() => setIframeSrc(null), []);

  const ctxValue = useMemo(() => open, [open]);

  return (
    <TalentLmsWebviewCtx.Provider value={ctxValue}>
      {children}
      <TalentLmsWebviewDialog url={iframeSrc} onDismiss={close} />
    </TalentLmsWebviewCtx.Provider>
  );
}

function TalentLmsWebviewDialog({
  url,
  onDismiss,
}: {
  url: string | null;
  onDismiss: () => void;
}) {
  const open = !!url;

  return (
    <Dialog
      open={open}
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
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <p className="min-w-[12rem] flex-1 text-sm leading-relaxed text-muted-foreground">
              SSO starts inside this panel when your browser allows it. If you see errors or a blank
              window, continue in a new tab instead.
            </p>
            {url ? (
              <Button variant="outline" size="sm" className="h-8 shrink-0" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </Button>
            ) : null}
          </div>
        </DialogHeader>
        <div className="relative flex-1 min-h-0 bg-muted/40">
          {url ? (
            <iframe
              title="TalentLMS"
              src={url}
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

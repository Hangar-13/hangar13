"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useLessonViewerChrome } from "@/components/lesson-viewer-chrome";

type Props = {
  title: string;
  packageId: string;
  launchPath: string;
  resumeKey: string;
  initialCmi: Record<string, string>;
  returnPath: string;
};

type Scorm12Api = {
  LMSInitialize: (param: string) => string;
  LMSFinish: (param: string) => string;
  LMSGetValue: (key: string) => string;
  LMSSetValue: (key: string, value: string) => string;
  LMSCommit: (param: string) => string;
  LMSGetLastError: () => string;
  LMSGetErrorString: (code: string) => string;
  LMSGetDiagnostic: (code: string) => string;
};

const CONTENTS_LAYOUT_STYLE_ID = "hangar-lesson-contents-layout";

/**
 * These lesson packages ship a Contents menu that starts closed and sits under
 * the title. When that menu is present, keep it open in a column to the right
 * of the page. Packages without this menu are left alone.
 */
function pinContentsBesideLesson(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc || doc.getElementById(CONTENTS_LAYOUT_STYLE_ID)) return;
  const toc = doc.getElementById("toc");
  const app = doc.getElementById("app");
  const main = doc.getElementById("main");
  if (!toc || !app || !main) return;

  if (toc.parentElement !== app) {
    main.insertAdjacentElement("afterend", toc);
  }
  toc.hidden = false;

  const style = doc.createElement("style");
  style.id = CONTENTS_LAYOUT_STYLE_ID;
  style.textContent = `
    #app { max-width: none; width: 100%; flex-flow: row wrap; align-items: stretch; }
    #app > header { order: 1; flex: 1 1 100%; }
    #app > #bar { order: 2; flex: 1 1 100%; }
    #app > main { order: 3; flex: 1 1 0; min-width: 0; }
    #app > footer { order: 5; flex: 1 1 100%; }
    #tocbtn { display: none !important; }
    nav#toc, nav#toc[hidden] {
      display: block !important;
      order: 4;
      flex: 0 0 18rem;
      width: 18rem;
      margin: 0;
      border: 0;
      border-left: 1px solid #ccd;
      border-radius: 0;
      position: sticky;
      top: 0;
      align-self: flex-start;
      height: 100vh;
      max-height: 100vh;
      overflow: auto;
      background: #f7f8fb;
    }
    @media (max-width: 720px) {
      #app > main { order: 4; flex-basis: 100%; }
      nav#toc, nav#toc[hidden] {
        order: 3;
        position: static;
        flex: 1 1 100%;
        width: 100%;
        height: auto;
        max-height: 40vh;
        border-left: 0;
        border-bottom: 1px solid #ccd;
      }
    }
  `;
  doc.head.appendChild(style);
}

const FOOTER_LAYOUT_STYLE_ID = "hangar-lesson-footer-layout";

/**
 * These packages show "3 / 26" and keep the furthest page reached in
 * suspend_data.m. Match the package's own bar: furthest page ÷ (pages − 1).
 */
function readPackageProgress(
  frame: HTMLIFrameElement | null,
  cmi: Record<string, string>
): number | null {
  const doc = frame?.contentDocument;
  const pg = doc?.getElementById("pg")?.textContent ?? "";
  const match = /(\d+)\s*\/\s*(\d+)/.exec(pg);
  const total = match ? Number(match[2]) : null;

  let index: number | null = null;
  const raw = cmi["cmi.suspend_data"];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { m?: unknown; p?: unknown };
      if (typeof parsed.m === "number") index = parsed.m;
      else if (typeof parsed.p === "number") index = parsed.p;
    } catch {
      index = null;
    }
  }
  if (index == null) {
    const loc = Number(cmi["cmi.core.lesson_location"]);
    if (Number.isFinite(loc)) index = loc;
  }

  if (index != null && total != null && total > 1) {
    return Math.min(100, Math.max(0, Math.round((100 * index) / (total - 1))));
  }

  const bar = doc?.getElementById("bar")?.getAttribute("aria-valuenow");
  if (bar != null && bar.trim() !== "") {
    const n = Number(bar);
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, Math.round(n)));
  }
  return null;
}

function withProgress(
  frame: HTMLIFrameElement | null,
  cmi: Record<string, string>
): Record<string, string> {
  const next = { ...cmi };
  const pct = readPackageProgress(frame, cmi);
  if (pct != null) next["cmi.progress_measure"] = String(pct);
  return next;
}

/**
 * The package footer pins Back and Next to opposite edges. Group them in the
 * center and add Exit lesson on the far left. Packages without this footer
 * are left alone.
 */
function placeLessonFooter(
  frame: HTMLIFrameElement,
  returnPath: string,
  onExit: () => Promise<void>
) {
  const doc = frame.contentDocument;
  if (!doc || doc.getElementById("hangar-exit-lesson")) return;
  const footer = doc.querySelector("#app > footer");
  const back = doc.getElementById("back");
  const next = doc.getElementById("next");
  const page = doc.getElementById("pg");
  if (!footer || !back || !next || !page) return;

  const style = doc.createElement("style");
  style.id = FOOTER_LAYOUT_STYLE_ID;
  style.textContent = `
    #app > footer {
      display: grid !important;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
    }
    #hangar-exit-lesson { grid-column: 1; justify-self: start; }
    #hangar-lesson-nav {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      gap: 12px;
    }
  `;
  doc.head.appendChild(style);

  const nav = doc.createElement("div");
  nav.id = "hangar-lesson-nav";
  nav.append(back, page, next);

  const exit = doc.createElement("button");
  exit.id = "hangar-exit-lesson";
  exit.type = "button";
  exit.className = "sec";
  exit.textContent = "Exit lesson";
  exit.addEventListener("click", () => {
    if (exit.disabled) return;
    exit.disabled = true;
    void onExit().then(
      () => {
        window.location.assign(returnPath);
      },
      () => {
        exit.disabled = false;
      }
    );
  });

  footer.replaceChildren(exit, nav);
}

function contentUrl(packageId: string, launchPath: string): string {
  const parts = launchPath.split("/").filter(Boolean).map(encodeURIComponent);
  return `/api/lesson-player/content/${packageId}/${parts.join("/")}`;
}

async function persist(
  packageId: string,
  cmi: Record<string, string>,
  finish: boolean
): Promise<void> {
  const response = await fetch("/api/lesson-player/commit", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packageId, cmi, finish }),
  });
  if (!response.ok) {
    throw new Error("Could not save lesson progress.");
  }
}

/**
 * SCORM 1.2 frame. The parent window owns `window.API`; the package iframe
 * must stay on this origin so the content can find that object.
 */
export function LessonPlayerFrame({
  title,
  packageId,
  launchPath,
  resumeKey,
  initialCmi,
  returnPath,
}: Props) {
  const { setTitle } = useLessonViewerChrome();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const cmiRef = useRef<Record<string, string>>({});
  const [src, setSrc] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useLayoutEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);

  useLayoutEffect(() => {
    const cmi = { ...initialCmi };
    cmiRef.current = cmi;
    const api: Scorm12Api = {
      LMSInitialize() {
        return "true";
      },
      LMSGetValue(key) {
        return cmi[key] ?? "";
      },
      LMSSetValue(key, value) {
        cmi[key] = String(value ?? "");
        return "true";
      },
      LMSCommit() {
        void persist(packageId, withProgress(frameRef.current, cmi), false).then(
          () => setSaveError(null),
          () => setSaveError("Progress could not be saved. Stay on this page and try again.")
        );
        return "true";
      },
      LMSFinish() {
        void persist(packageId, withProgress(frameRef.current, cmi), true).then(
          () => setSaveError(null),
          () => setSaveError("Progress could not be saved. Stay on this page and try again.")
        );
        return "true";
      },
      LMSGetLastError() {
        return "0";
      },
      LMSGetErrorString() {
        return "No error";
      },
      LMSGetDiagnostic() {
        return "";
      },
    };

    const win = window as Window & { API?: Scorm12Api };
    win.API = api;
    setSrc(contentUrl(packageId, launchPath));

    return () => {
      if (win.API === api) delete win.API;
    };
  }, [packageId, launchPath, resumeKey, initialCmi]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {saveError ? (
        <p className="shrink-0 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}
      {src ? (
        <iframe
          key={resumeKey}
          ref={frameRef}
          title={title}
          src={src}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          onLoad={(event) => {
            frameRef.current = event.currentTarget;
            pinContentsBesideLesson(event.currentTarget);
            placeLessonFooter(event.currentTarget, returnPath, async () => {
              try {
                await persist(
                  packageId,
                  withProgress(frameRef.current, cmiRef.current),
                  false
                );
                setSaveError(null);
              } catch {
                setSaveError(
                  "Progress could not be saved. Stay on this page and try again."
                );
                throw new Error("Could not save lesson progress.");
              }
            });
          }}
        />
      ) : (
        <div className="min-h-0 w-full flex-1 bg-muted/40" />
      )}
    </div>
  );
}

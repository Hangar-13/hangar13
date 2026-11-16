"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { tourForPath, type PageTourStep } from "@/lib/page-tours";

const STORAGE_KEY = "h13-seen-page-tours";

type Box = { top: number; left: number; width: number };

function readSeen(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    return new Set(parsed[userId] ?? []);
  } catch {
    return new Set();
  }
}

function writeSeen(userId: string, tourId: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const next = new Set(parsed[userId] ?? []);
    next.add(tourId);
    parsed[userId] = [...next];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore private-mode storage failures.
  }
}

function dialogOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"]'));
}

function visibleTarget(id: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const node of nodes) {
    if (node.closest('[role="dialog"]')) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    return node;
  }
  return null;
}

function availableSteps(steps: PageTourStep[]): PageTourStep[] {
  return steps.filter((step) => visibleTarget(step.target));
}

function placeBubble(target: HTMLElement): Box {
  const rect = target.getBoundingClientRect();
  const width = 280;
  const estimatedHeight = 132;
  const margin = 12;
  let top = rect.bottom + margin;
  if (top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estimatedHeight - margin);
  }
  const left = Math.min(
    Math.max(margin, rect.left),
    window.innerWidth - width - margin
  );
  return { top, left, width };
}

export function PageTour() {
  const pathname = usePathname() || "";
  const [steps, setSteps] = useState<PageTourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [hidden, setHidden] = useState(false);
  const [tourId, setTourId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tour = tourForPath(pathname);
    if (!tour) return;

    const timer = window.setTimeout(async () => {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (cancelled || !user) return;
      if (readSeen(user.id).has(tour.id)) return;

      const started = Date.now();
      let found = availableSteps(tour.steps);
      while (!cancelled && found.length === 0 && Date.now() - started < 1600) {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        found = availableSteps(tour.steps);
      }
      if (cancelled || found.length === 0) return;
      setUserId(user.id);
      setTourId(tour.id);
      setSteps(found);
      setIndex(0);
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname]);

  const step = steps[index];

  useEffect(() => {
    if (!step) return;
    let frame = 0;

    const sync = () => {
      const blocked = dialogOpen();
      setHidden(blocked);
      document.querySelectorAll<HTMLElement>("[data-tour-active]").forEach((node) => {
        node.removeAttribute("data-tour-active");
      });
      if (blocked) {
        setBox(null);
        return;
      }
      const target = visibleTarget(step.target);
      if (!target) {
        setBox(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const outOfView = rect.bottom < 80 || rect.top > window.innerHeight - 80;
      if (outOfView) {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      }
      target.setAttribute("data-tour-active", "true");
      setBox(placeBubble(target));
    };

    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (userId && tourId) writeSeen(userId, tourId);
        setSteps([]);
        setBox(null);
      }
    };

    frame = requestAnimationFrame(sync);
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    window.addEventListener("keydown", onKey);
    const observer = new MutationObserver(onChange);
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-state"],
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
      document.querySelectorAll<HTMLElement>("[data-tour-active]").forEach((node) => {
        node.removeAttribute("data-tour-active");
      });
    };
  }, [step, tourId, userId]);

  function finish() {
    if (userId && tourId) writeSeen(userId, tourId);
    setSteps([]);
    setBox(null);
  }

  if (!step || hidden || !box) return null;

  const last = index >= steps.length - 1;

  return (
    <div
      className="fixed z-[70] rounded-lg border border-blue-300 bg-blue-600 px-3 py-3 text-white shadow-xl shadow-blue-950/30"
      style={{ top: box.top, left: box.left, width: box.width }}
      role="status"
    >
      <p className="text-sm leading-snug">{step.text}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-blue-100">
          {index + 1} of {steps.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs font-medium text-blue-100 hover:text-white"
            onClick={finish}
          >
            Skip
          </button>
          <button
            type="button"
            className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            onClick={() => {
              if (last) finish();
              else setIndex((current) => current + 1);
            }}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CAPTURE_FALLBACK_MS,
  CAPTURE_PLACEHOLDER_LABELS,
  captureVideoSrc,
  capturesForAudience,
  type ProductCaptureAudience,
  type ProductCaptureId,
} from "@/lib/marketing/product-captures";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function CaptureClip({
  id,
  pinned,
  reducedMotion,
  onFinished,
}: {
  id: ProductCaptureId;
  pinned: boolean;
  reducedMotion: boolean;
  onFinished: () => void;
}) {
  const [missing, setMissing] = useState(false);

  // If the file is missing, still advance the tour (unless pinned).
  useEffect(() => {
    if (!missing || pinned || reducedMotion) return;
    const timer = window.setTimeout(onFinished, CAPTURE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [missing, pinned, reducedMotion, onFinished]);

  if (missing) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-[#121417] px-6 text-center text-white">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#FF4D00]">
          Capture not recorded yet
        </p>
        <p className="text-base font-bold">{CAPTURE_PLACEHOLDER_LABELS[id]}</p>
        <p className="font-mono text-xs text-white/50">public/marketing/captures/{id}.mp4</p>
      </div>
    );
  }

  return (
    <video
      className="block h-auto w-full bg-[#121417]"
      src={captureVideoSrc(id)}
      autoPlay={!reducedMotion}
      controls={reducedMotion}
      muted
      playsInline
      preload="auto"
      // Pinned: replay the same clip. Cycling: play once, then move on.
      loop={pinned}
      onEnded={pinned ? undefined : onFinished}
      onError={() => setMissing(true)}
      aria-label={CAPTURE_PLACEHOLDER_LABELS[id]}
    />
  );
}

export function ProductCapturePlayer({
  audience,
  activeIndex,
  pinned,
  onActiveIndexChange,
  onContinue,
}: {
  audience: ProductCaptureAudience;
  activeIndex: number;
  /** True once the visitor has clicked a feature. Stops auto-cycling. */
  pinned: boolean;
  /** Called when a clip finishes while cycling (not pinned). */
  onActiveIndexChange: (index: number) => void;
  /** Resume the tour from the next clip. */
  onContinue: () => void;
}) {
  const clips = capturesForAudience(audience);
  const safeIndex = ((activeIndex % clips.length) + clips.length) % clips.length;
  const id = clips[safeIndex];
  const reducedMotion = usePrefersReducedMotion();

  return (
    <figure className="mx-auto w-full max-w-[1440px]">
      <div className="overflow-hidden rounded-lg bg-[#121417] shadow-[0_24px_60px_rgba(18,20,23,.18)] ring-1 ring-black/10">
        <CaptureClip
          key={id}
          id={id}
          pinned={pinned}
          reducedMotion={reducedMotion}
          onFinished={() => onActiveIndexChange((safeIndex + 1) % clips.length)}
        />
      </div>
      <div className="mt-3 flex min-h-9 items-center justify-between gap-4">
        <div className="flex gap-1.5" aria-hidden>
          {clips.map((clip, index) => (
            <span
              key={clip}
              className={cn(
                "h-1 w-6",
                index === safeIndex ? "bg-[#FF4D00]" : "bg-[#121417]/15"
              )}
            />
          ))}
        </div>
        {pinned ? (
          <button
            type="button"
            onClick={onContinue}
            className="bg-[#121417] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0055FF]"
          >
            Continue
          </button>
        ) : null}
      </div>
    </figure>
  );
}

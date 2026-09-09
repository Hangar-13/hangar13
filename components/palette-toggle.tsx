"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePalette, type AppPalette } from "@/components/palette-provider";

const OPTIONS: { id: AppPalette; label: string }[] = [
  { id: "landing", label: "New" },
  { id: "classic", label: "Old" },
];

export function PaletteToggle() {
  const { palette, setPalette } = usePalette();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = mounted ? palette : "landing";

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-foreground/45">
        Colors · temp
      </p>
      <div
        className="grid grid-cols-2 gap-1 bg-white/10 p-1"
        role="group"
        aria-label="App color palette"
      >
        {OPTIONS.map((option) => {
          const selected = active === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setPalette(option.id)}
              className={cn(
                "px-2 py-1.5 text-[11px] font-semibold",
                selected
                  ? option.id === "landing"
                    ? "bg-[#FF4D00] text-white"
                    : "bg-[#FFCF03] text-[#1E1E38]"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
              )}
              aria-pressed={selected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

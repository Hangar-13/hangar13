"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const PALETTE_STORAGE_KEY = "hangar-palette";
export type AppPalette = "landing" | "classic";

function readStoredPalette(): AppPalette {
  if (typeof window === "undefined") return "landing";
  try {
    return window.localStorage.getItem(PALETTE_STORAGE_KEY) === "classic"
      ? "classic"
      : "landing";
  } catch {
    return "landing";
  }
}

function applyPalette(palette: AppPalette) {
  const root = document.documentElement;
  if (palette === "classic") {
    root.setAttribute("data-palette", "classic");
  } else {
    root.removeAttribute("data-palette");
  }
}

type PaletteContextValue = {
  palette: AppPalette;
  setPalette: (palette: AppPalette) => void;
};

const PaletteContext = createContext<PaletteContextValue | null>(null);

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<AppPalette>("landing");

  useEffect(() => {
    const next = readStoredPalette();
    setPaletteState(next);
    applyPalette(next);
  }, []);

  const setPalette = useCallback((next: AppPalette) => {
    setPaletteState(next);
    applyPalette(next);
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const value = useMemo(() => ({ palette, setPalette }), [palette, setPalette]);

  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette() {
  const context = useContext(PaletteContext);
  if (!context) {
    throw new Error("usePalette must be used within PaletteProvider");
  }
  return context;
}

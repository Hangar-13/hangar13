"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type LessonViewerChromeValue = {
  title: string | null;
  setTitle: (title: string | null) => void;
};

const LessonViewerChromeContext = createContext<LessonViewerChromeValue | null>(
  null
);

export function LessonViewerChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [title, setTitleState] = useState<string | null>(null);
  const setTitle = useCallback((next: string | null) => {
    setTitleState(next);
  }, []);
  const value = useMemo(() => ({ title, setTitle }), [title, setTitle]);
  return (
    <LessonViewerChromeContext.Provider value={value}>
      {children}
    </LessonViewerChromeContext.Provider>
  );
}

export function useLessonViewerChrome(): LessonViewerChromeValue {
  const value = useContext(LessonViewerChromeContext);
  if (!value) {
    throw new Error("useLessonViewerChrome must be used inside LessonViewerChromeProvider");
  }
  return value;
}

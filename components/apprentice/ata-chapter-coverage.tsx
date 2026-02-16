"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AtaChapterItem = { chapter_number: string; title: string };

interface AtaChapterCoverageProps {
  ataChapterHours: Record<string, number>;
  ataChapterData?: Record<string, { hours: number; status: string }>;
  ataChapters: AtaChapterItem[];
  acsCoverageByChapter?: Record<string, { satisfied: number; total: number; satisfiedCodeIds: number[] }>;
  coverageMode?: "log" | "acs";
  onChapterSelect?: (chapterCode: string) => void;
  /** When true, renders without the Card wrapper (for embedding in a parent card) */
  embedded?: boolean;
  /** Override section header when embedded (e.g. "ATA Chapters") */
  sectionTitle?: string;
}

export function AtaChapterCoverage({ 
  ataChapterHours, 
  ataChapterData,
  ataChapters,
  acsCoverageByChapter = {},
  coverageMode = "log",
  onChapterSelect,
  embedded = false,
  sectionTitle,
}: AtaChapterCoverageProps) {
  const totalChapters = ataChapters.length;
  const ataChaptersMap: Record<string, string> = Object.fromEntries(
    ataChapters.map((c) => [c.chapter_number, `${c.chapter_number} - ${c.title}`])
  );
  const chaptersWithHours = Object.keys(ataChapterHours).length;

  const getCellColorLog = (hours: number) => {
    if (hours === 0) return "bg-[#F5F0E8]";
    if (hours >= 1 && hours <= 9) return "bg-[#CC5A2A]";
    return "bg-green-500";
  };

  const getCellColorAcs = (satisfied: number, total: number) => {
    if (satisfied === 0) return "bg-[#F5F0E8]";
    if (satisfied < total) return "bg-[#CC5A2A]";
    return "bg-green-500";
  };

  const sectionHeader = sectionTitle ? (
    <div className="px-6 pb-1">
      <CardTitle className="text-sm">{sectionTitle}</CardTitle>
    </div>
  ) : (
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle>ATA Chapter Coverage</CardTitle>
        <span className="text-sm text-muted-foreground">
          {chaptersWithHours} of {totalChapters} chapters
        </span>
      </div>
    </CardHeader>
  );

  const gridContent = (
    <CardContent className={sectionTitle ? "pt-0" : undefined}>
        <div className="flex flex-wrap gap-1 mb-4">
          {ataChapters.map(({ chapter_number: chapter }) => {
            const hours = ataChapterHours[chapter] || 0;
            const acsCoverage = acsCoverageByChapter[chapter] ?? { satisfied: 0, total: 0, satisfiedCodeIds: [] };
            const { satisfied: acsSatisfied, total: acsTotal } = acsCoverage;
            const chapterData = ataChapterData?.[chapter];
            const status = chapterData?.status || "none";
            const chapterTitle = ataChaptersMap[chapter] || `ATA ${chapter}`;

            const isLogMode = coverageMode === "log";
            const cellColor = isLogMode
              ? getCellColorLog(hours)
              : getCellColorAcs(acsSatisfied, acsTotal);
            const hasContent = isLogMode ? hours > 0 : acsSatisfied > 0;

            const tooltipText = isLogMode
              ? (() => {
                  const getStatusLabel = (s: string) => {
                    switch (s) {
                      case "draft": return "Draft";
                      case "submitted": return "Pending Signature";
                      case "approved": return "Approved";
                      default: return null;
                    }
                  };
                  const statusLabel = getStatusLabel(status);
                  return statusLabel
                    ? `${chapterTitle}\n${hours}h logged\nStatus: ${statusLabel}`
                    : `${chapterTitle}\n${hours}h logged`;
                })()
              : `${chapterTitle}\n${acsSatisfied}/${acsTotal} codes complete`;

            const handleClick = () => {
              onChapterSelect?.(chapter);
            };

            return (
              <div
                key={chapter}
                className={cn(
                  "size-8 rounded border border-gray-300 flex items-center justify-center text-xs font-medium shrink-0",
                  cellColor,
                  hasContent ? "text-white" : "text-gray-400",
                  onChapterSelect ? "cursor-pointer hover:opacity-80" : "cursor-default"
                )}
                title={tooltipText}
                onClick={handleClick}
              >
                {chapter}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 text-xs">
          {coverageMode === "log" ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-gray-300 bg-[#F5F0E8]"></div>
                <span className="text-muted-foreground">0 hrs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-gray-300 bg-[#CC5A2A]"></div>
                <span className="text-muted-foreground">1-9 hrs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-gray-300 bg-green-500"></div>
                <span className="text-muted-foreground">10+ hrs</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-gray-300 bg-[#F5F0E8]"></div>
                <span className="text-muted-foreground">No codes complete</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-gray-300 bg-[#CC5A2A]"></div>
                <span className="text-muted-foreground">Some codes complete</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-gray-300 bg-green-500"></div>
                <span className="text-muted-foreground">All codes complete</span>
              </div>
            </>
          )}
        </div>
    </CardContent>
  );

  const content = sectionTitle && embedded ? (
    <div className="space-y-1">
      {sectionHeader}
      {gridContent}
    </div>
  ) : (
    <>
      {sectionHeader}
      {gridContent}
    </>
  );

  if (embedded) {
    return content;
  }

  return <Card className="bg-card/25">{content}</Card>;
}

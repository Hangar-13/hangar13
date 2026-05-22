"use client";

import { cn } from "@/lib/utils";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";

export type AtaChapterItem = { chapter_number: string; title: string };

interface AtaChapterCoverageProps {
  ataChapterHours: Record<string, number>;
  ataChapterData?: Record<string, { hours: number; status: string }>;
  ataChapters: AtaChapterItem[];
  acsCoverageByChapter?: Record<string, { satisfied: number; total: number; satisfiedCodeIds: number[] }>;
  coverageMode?: "log" | "acs";
  onChapterSelect?: (chapterCode: string) => void;
  /** When true, renders without an outer card wrapper */
  embedded?: boolean;
  /** Override section header when embedded */
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

  const content = (
    <div className={embedded ? "space-y-3" : "space-y-4"}>
      {!embedded ? (
        <div className="flex items-center justify-between gap-3">
          <DashboardSectionLabel>ATA chapter coverage</DashboardSectionLabel>
          <span className="text-xs text-muted-foreground">
            {chaptersWithHours} of {totalChapters} chapters
          </span>
        </div>
      ) : sectionTitle ? (
        <p className="text-sm font-semibold text-foreground">{sectionTitle}</p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1">
        {ataChapters.map(({ chapter_number: chapter }) => {
          const hours = ataChapterHours[chapter] || 0;
          const acsCoverage = acsCoverageByChapter[chapter] ?? {
            satisfied: 0,
            total: 0,
            satisfiedCodeIds: [],
          };
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
                    case "draft":
                      return "Draft";
                    case "submitted":
                      return "Pending Signature";
                    case "approved":
                      return "Approved";
                    default:
                      return null;
                  }
                };
                const statusLabel = getStatusLabel(status);
                return statusLabel
                  ? `${chapterTitle}\n${hours}h logged\nStatus: ${statusLabel}`
                  : `${chapterTitle}\n${hours}h logged`;
              })()
            : `${chapterTitle}\n${acsSatisfied}/${acsTotal} codes complete`;

          return (
            <div
              key={chapter}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded border border-gray-300 text-xs font-medium",
                cellColor,
                hasContent ? "text-white" : "text-gray-400",
                onChapterSelect ? "cursor-pointer hover:opacity-80" : "cursor-default"
              )}
              title={tooltipText}
              onClick={() => onChapterSelect?.(chapter)}
            >
              {chapter}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        {coverageMode === "log" ? (
          <>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-gray-300 bg-[#F5F0E8]" />
              <span className="text-muted-foreground">0 hrs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-gray-300 bg-[#CC5A2A]" />
              <span className="text-muted-foreground">1-9 hrs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-gray-300 bg-green-500" />
              <span className="text-muted-foreground">10+ hrs</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-gray-300 bg-[#F5F0E8]" />
              <span className="text-muted-foreground">No codes complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-gray-300 bg-[#CC5A2A]" />
              <span className="text-muted-foreground">Some codes complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-gray-300 bg-green-500" />
              <span className="text-muted-foreground">All codes complete</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <section>{content}</section>;
}

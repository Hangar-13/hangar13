"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AtaChapterCoverage, type AtaChapterItem } from "./ata-chapter-coverage";
import { MilestonesTimeline } from "./milestones-timeline";
import { AddEntryModal } from "./add-entry-modal";
import { cn } from "@/lib/utils";
import type { ProgressData } from "@/app/actions/progress";
import { formatUiDate } from "@/lib/format-ui-date";
import {
  DashboardContentFrame,
  DashboardSectionLabel,
  DashboardStatCell,
  DashboardStatStrip,
  DashboardTableShell,
} from "@/components/dashboard/page-shell";

interface ProgressTrackingDashboardProps {
  progressData: ProgressData;
  ataChapters: AtaChapterItem[];
}

export function ProgressTrackingDashboard({ progressData, ataChapters }: ProgressTrackingDashboardProps) {
  const {
    totalHours,
    trainingHoursCompleted,
    trainingHoursRequired,
    trainingProgressPercent,
    currentWeek,
    totalWeeks,
    expectedHours,
    hoursDifference,
    approvedWeeklySubmissionsCount,
    ataChapterHours,
    chaptersWithHours,
    logbookEntries,
  } = progressData;

  const [selectedEntry, setSelectedEntry] = useState<ProgressData["logbookEntries"][0] | null>(null);
  const [logsPage, setLogsPage] = useState(1);

  const LOGS_PER_PAGE = 20;

  const defaultChapter = useMemo(() => {
    const withChapter = logbookEntries.filter((e) =>
      e.skills_practiced?.some((s) => s?.match(/ATA:\s*(\d+)\s*-/))
    );
    if (withChapter.length === 0) return Object.keys(ataChapterHours)[0] ?? null;
    const sorted = [...withChapter].sort(
      (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    );
    const firstSkill = sorted[0].skills_practiced?.find((s) => s?.match(/ATA:\s*(\d+)\s*-/));
    const match = firstSkill?.match(/ATA:\s*(\d+)\s*-/);
    return match ? match[1] : Object.keys(ataChapterHours)[0] ?? null;
  }, [logbookEntries, ataChapterHours]);

  const [selectedChapter, setSelectedChapter] = useState<string | null>(defaultChapter);

  useEffect(() => {
    setLogsPage(1);
  }, [selectedChapter]);

  const logsForChapter = useMemo(() => {
    if (!selectedChapter) return [];
    return logbookEntries
      .filter((entry) =>
        entry.skills_practiced?.some((skill) => {
          const match = skill?.match(/ATA:\s*(\d+)\s*-/);
          return match && match[1] === selectedChapter;
        })
      )
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
  }, [logbookEntries, selectedChapter]);

  const targetHours = 5200;
  const percentageComplete =
    totalWeeks > 0
      ? Math.round((currentWeek / totalWeeks) * 100)
      : Math.round(trainingProgressPercent);
  const totalATAChapters = ataChapters.length;
  const ataChaptersMap = Object.fromEntries(
    ataChapters.map((c) => [c.chapter_number, `${c.chapter_number} - ${c.title}`])
  );

  return (
    <DashboardContentFrame>
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DashboardSectionLabel>Overall program progress</DashboardSectionLabel>
            <p className="mt-1 text-sm text-muted-foreground">
              {totalWeeks > 0 ? (
                <>Week {currentWeek} of {totalWeeks}</>
              ) : (
                <>No lessons in this program yet</>
              )}
            </p>
          </div>
          <span className="shrink-0 text-2xl font-bold tabular-nums text-primary">
            {percentageComplete}%
          </span>
        </div>
        <Progress value={percentageComplete} className="h-2" />
      </div>

      <DashboardStatStrip>
        <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-y-0 lg:divide-x lg:divide-border/30">
          <DashboardStatCell
            value={trainingHoursRequired > 0 ? `${trainingProgressPercent}%` : "—"}
            label="Training path"
            detail={
              trainingHoursRequired > 0
                ? `${trainingHoursCompleted.toFixed(1)} / ${trainingHoursRequired.toFixed(1)} h`
                : "No lesson hours"
            }
          />
          <DashboardStatCell
            value={totalHours}
            label="Logbook hours"
            detail={`of ${targetHours.toLocaleString()} OJT target`}
          />
          <DashboardStatCell
            value={`${hoursDifference >= 0 ? "+" : ""}${hoursDifference}h`}
            label="Pace"
            detail={hoursDifference < 0 ? "Behind schedule" : "Ahead of schedule"}
          />
          <DashboardStatCell
            value={chaptersWithHours}
            label="ATA chapters"
            detail={`of ${totalATAChapters} covered`}
          />
          <DashboardStatCell
            value={approvedWeeklySubmissionsCount}
            label="Weeks approved"
            detail="Submissions signed off"
          />
        </div>
      </DashboardStatStrip>

      <section className="space-y-2.5">
        <DashboardSectionLabel>OJT hours progress</DashboardSectionLabel>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{totalHours} hours logged</span>
          <span className="text-muted-foreground">{targetHours.toLocaleString()} target</span>
        </div>
        <Progress
          value={Math.min(100, (totalHours / targetHours) * 100)}
          className="h-2 bg-secondary/20"
          indicatorClassName="bg-secondary"
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Expected </span>
            <span className="font-semibold">{expectedHours}h</span>
          </span>
          <span>
            <span className="text-muted-foreground">Actual </span>
            <span className="font-semibold">{totalHours}h</span>
          </span>
          <span>
            <span className="text-muted-foreground">Difference </span>
            <span
              className={cn("font-semibold", hoursDifference >= 0 ? "text-emerald-600" : "text-red-600")}
            >
              {hoursDifference >= 0 ? "+" : ""}
              {hoursDifference}h
            </span>
          </span>
        </div>
      </section>

      <section className="space-y-5">
        <DashboardSectionLabel>Log coverage</DashboardSectionLabel>
        <AtaChapterCoverage
          ataChapterHours={ataChapterHours}
          ataChapterData={progressData.ataChapterData}
          ataChapters={ataChapters}
          coverageMode="log"
          onChapterSelect={(chapter) => setSelectedChapter(chapter)}
          embedded
          sectionTitle="ATA chapters"
        />

        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold text-foreground">
            {selectedChapter
              ? `Logs for ${ataChaptersMap[selectedChapter] ?? `ATA ${selectedChapter}`}`
              : "Chapter logs"}
          </h3>
          {selectedChapter && logsForChapter.length === 0 ? (
            <p className="text-sm text-muted-foreground">No logs for this chapter yet.</p>
          ) : selectedChapter && logsForChapter.length > 0 ? (
            <div className="space-y-4">
              <DashboardTableShell>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/20">
                      <th className="w-24 px-3 py-2 text-left font-semibold">Date</th>
                      <th className="px-3 py-2 text-left font-semibold">Description</th>
                      <th className="w-16 px-3 py-2 text-left font-semibold">Hours</th>
                      <th className="w-28 px-3 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsForChapter
                      .slice((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE)
                      .map((entry) => (
                        <tr
                          key={entry.id}
                          onClick={() => setSelectedEntry(entry)}
                          className="cursor-pointer border-b border-border/25 transition-colors last:border-b-0 hover:bg-muted/20"
                        >
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {formatUiDate(entry.entry_date)}
                          </td>
                          <td className="px-3 py-2.5 font-medium">{entry.description}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-secondary">
                            {entry.hours_worked}h
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-block rounded px-2 py-0.5 text-xs",
                                entry.status === "approved" &&
                                  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                                entry.status === "submitted" &&
                                  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                                entry.status === "draft" &&
                                  "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
                                entry.status === "rejected" &&
                                  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              )}
                            >
                              {entry.status === "submitted"
                                ? "Pending"
                                : entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </DashboardTableShell>
              {logsForChapter.length > LOGS_PER_PAGE && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Page {logsPage} of {Math.ceil(logsForChapter.length / LOGS_PER_PAGE)} (
                    {logsForChapter.length} logs)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                      disabled={logsPage <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setLogsPage((p) =>
                          Math.min(Math.ceil(logsForChapter.length / LOGS_PER_PAGE), p + 1)
                        )
                      }
                      disabled={logsPage >= Math.ceil(logsForChapter.length / LOGS_PER_PAGE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a chapter above to view its logs.</p>
          )}
        </div>
      </section>

      <MilestonesTimeline currentWeek={currentWeek} totalWeeks={totalWeeks} />

      {selectedEntry && (
        <AddEntryModal
          ataChapters={ataChapters.map((c) => ({
            value: c.chapter_number,
            label: `${c.chapter_number} - ${c.title}`,
          }))}
          entry={selectedEntry}
          open={!!selectedEntry}
          onOpenChange={(open) => {
            if (!open) setSelectedEntry(null);
          }}
          onSuccess={() => setSelectedEntry(null)}
        />
      )}
    </DashboardContentFrame>
  );
}

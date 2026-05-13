"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Clock, Target, Award, Waves } from "lucide-react";
import { AtaChapterCoverage, type AtaChapterItem } from "./ata-chapter-coverage";
import { MilestonesTimeline } from "./milestones-timeline";
import { AddEntryModal } from "./add-entry-modal";
import { cn } from "@/lib/utils";
import type { ProgressData } from "@/app/actions/progress";
import { formatUiDate } from "@/lib/format-ui-date";

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
    <div className="space-y-6">
      <Card className="bg-[#6C5067] border-[#6C5067]">
        <CardContent className="p-6 pt-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Overall Program Progress</h2>
              <p className="text-white/80 mt-1">
                {totalWeeks > 0 ? (
                  <>
                    Week {currentWeek} of {totalWeeks}
                  </>
                ) : (
                  <>No lessons in this program yet</>
                )}
              </p>
            </div>
            <div className="text-3xl font-bold text-white">{percentageComplete}% Complete</div>
          </div>
          <Progress value={percentageComplete} className="h-3" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Training Path</span>
              </div>
            </div>
            <div className="text-2xl font-bold">
              {trainingHoursRequired > 0 ? `${trainingProgressPercent}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {trainingHoursRequired > 0
                ? `${trainingHoursCompleted.toFixed(1)} / ${trainingHoursRequired.toFixed(1)} h planned`
                : "No lesson hours in program"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Logbook hours</span>
              </div>
            </div>
            <div className="text-2xl font-bold">{totalHours}</div>
            <div className="text-xs text-muted-foreground mt-1">of {targetHours.toLocaleString()} OJT target</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Waves className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Pace Status</span>
              </div>
            </div>
            <div className="text-2xl font-bold">
              {hoursDifference >= 0 ? "+" : ""}
              {hoursDifference}h
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {hoursDifference < 0 ? "Behind schedule" : "Ahead of schedule"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">ATA Chapters</span>
              </div>
            </div>
            <div className="text-2xl font-bold">{chaptersWithHours}</div>
            <div className="text-xs text-muted-foreground mt-1">of {totalATAChapters} covered</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Weeks Approved</span>
              </div>
            </div>
            <div className="text-2xl font-bold">{approvedWeeklySubmissionsCount}</div>
            <div className="text-xs text-muted-foreground mt-1">weekly submissions signed off</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Hours Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{totalHours} hours logged</span>
            <span className="text-sm text-muted-foreground">{targetHours.toLocaleString()} target hours</span>
          </div>
          <Progress value={Math.min(100, (totalHours / targetHours) * 100)} className="h-3" />
          <hr className="my-4 border-border" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Expected: </span>
              <span className="font-semibold">{expectedHours}h</span>
            </span>
            <span>
              <span className="text-muted-foreground">Actual: </span>
              <span className="font-semibold">{totalHours}h</span>
            </span>
            <span>
              <span className="text-muted-foreground">Difference: </span>
              <span
                className={cn("font-semibold", hoursDifference >= 0 ? "text-green-600" : "text-red-600")}
              >
                {hoursDifference >= 0 ? "+" : ""}
                {hoursDifference}h
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Log coverage</CardTitle>
        </CardHeader>
        <AtaChapterCoverage
          ataChapterHours={ataChapterHours}
          ataChapterData={progressData.ataChapterData}
          ataChapters={ataChapters}
          coverageMode="log"
          onChapterSelect={(chapter) => setSelectedChapter(chapter)}
          embedded
          sectionTitle="ATA chapters"
        />
        <hr className="mx-6 border-border" />
        <div className="space-y-1">
          <div className="px-6 pb-1">
            <CardTitle className="text-sm">
              {selectedChapter
                ? `Logs for ${ataChaptersMap[selectedChapter] ?? `ATA ${selectedChapter}`}`
                : "Logs"}
            </CardTitle>
          </div>
          <CardContent className="pt-0">
            {selectedChapter && logsForChapter.length === 0 ? (
              <p className="text-sm text-muted-foreground">No logs for this chapter yet.</p>
            ) : selectedChapter && logsForChapter.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-1.5 px-3 text-sm font-semibold w-24 border-r border-border/60 text-foreground">
                          Date
                        </th>
                        <th className="text-left py-1.5 px-3 text-sm font-semibold border-r border-border/60 text-foreground">
                          Description
                        </th>
                        <th className="text-left py-1.5 px-3 text-sm font-semibold w-16 border-r border-border/60 text-foreground">
                          Hours
                        </th>
                        <th className="text-left py-1.5 px-3 text-sm font-semibold w-28 text-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsForChapter
                        .slice((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE)
                        .map((entry) => (
                          <tr
                            key={entry.id}
                            onClick={() => setSelectedEntry(entry)}
                            className="border-b cursor-pointer transition-colors hover:bg-muted/50 last:border-b-0"
                          >
                            <td className="py-2 px-3 text-sm border-r border-border/60 whitespace-nowrap w-24 text-foreground">
                              {formatUiDate(entry.entry_date)}
                            </td>
                            <td className="py-2 px-3 text-sm font-medium border-r border-border/60 text-foreground">
                              {entry.description}
                            </td>
                            <td className="py-2 px-3 text-sm border-r border-border/60 whitespace-nowrap w-16 text-foreground">
                              {entry.hours_worked}h
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap w-28">
                              <span
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded inline-block",
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
                </div>
                {logsForChapter.length > LOGS_PER_PAGE && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Page {logsPage} of {Math.ceil(logsForChapter.length / LOGS_PER_PAGE)} ({logsForChapter.length}{" "}
                      logs)
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
                          setLogsPage((p) => Math.min(Math.ceil(logsForChapter.length / LOGS_PER_PAGE), p + 1))
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
          </CardContent>
        </div>
      </Card>

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
    </div>
  );
}

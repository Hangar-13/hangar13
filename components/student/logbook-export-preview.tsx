import type { ExportFormat } from "@/lib/certification-export";
import type { LogbookExportReport } from "@/lib/logbook-export";
import {
  serializeLogbookExportCsv,
  serializeLogbookExportJson,
} from "@/lib/logbook-export";
import { formatUiDate } from "@/lib/format-ui-date";

function PdfLayoutPreview({ report }: { report: LogbookExportReport }) {
  return (
    <div className="space-y-5 rounded-md bg-white p-5 text-foreground shadow-inner ring-1 ring-black/[0.06]">
      <div className="h-1.5 rounded-full bg-primary" aria-hidden />
      <div className="space-y-1 border-b border-border/30 pb-4">
        <h3 className="text-lg font-bold leading-snug tracking-tight">{report.title}</h3>
        <p className="text-sm font-medium text-muted-foreground">{report.studentName}</p>
        <p className="text-xs text-muted-foreground">
          Generated {formatUiDate(report.generatedAt)}
          {" · "}
          {report.totals.logCount} logs · {report.totals.totalHours} hours
        </p>
      </div>

      {report.reportMode === "summary" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-[#1E1E38] text-white">
                <th className="px-2 py-1.5 font-semibold">ATA Chapter</th>
                <th className="px-2 py-1.5 font-semibold">Logs</th>
                <th className="px-2 py-1.5 font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {report.summarySections.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-muted-foreground">
                    No entries match the current filters.
                  </td>
                </tr>
              ) : (
                <>
                  {report.summarySections.map((section) => (
                    <tr key={section.chapterLabel} className="border-b border-border/20">
                      <td className="px-2 py-1.5">{section.chapterLabel}</td>
                      <td className="px-2 py-1.5 tabular-nums">{section.logCount}</td>
                      <td className="px-2 py-1.5 tabular-nums">{section.totalHours}h</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border/40 bg-muted/15 font-medium">
                    <td className="px-2 py-1.5">Total</td>
                    <td className="px-2 py-1.5 tabular-nums">{report.totals.logCount}</td>
                    <td className="px-2 py-1.5 tabular-nums">{report.totals.totalHours}h</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {report.detailedEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No entries match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-[#1E1E38] text-white">
                    <th className="px-2 py-1.5 font-semibold">Date</th>
                    <th className="px-2 py-1.5 font-semibold">Task</th>
                    <th className="px-2 py-1.5 font-semibold">Hrs</th>
                    <th className="px-2 py-1.5 font-semibold">ATA</th>
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.detailedEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-border/20">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {formatUiDate(entry.date)}
                      </td>
                      <td className="px-2 py-1.5">{entry.description}</td>
                      <td className="px-2 py-1.5 tabular-nums">{entry.hours}h</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {entry.ataChapters.join(", ") || "—"}
                      </td>
                      <td className="px-2 py-1.5">{entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.detailedEntries.some(
            (entry) => entry.aircraft || entry.engine || entry.propeller
          ) ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Equipment details
              </h4>
              <div className="overflow-x-auto rounded-md ring-1 ring-black/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-muted/30 text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Date</th>
                      <th className="px-2 py-1 font-medium">Aircraft</th>
                      <th className="px-2 py-1 font-medium">Engine</th>
                      <th className="px-2 py-1 font-medium">Propeller</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.detailedEntries
                      .filter(
                        (entry) => entry.aircraft || entry.engine || entry.propeller
                      )
                      .map((entry) => (
                        <tr key={`eq-${entry.id}`} className="border-t border-border/20">
                          <td className="px-2 py-1 whitespace-nowrap">
                            {formatUiDate(entry.date)}
                          </td>
                          <td className="px-2 py-1">{entry.aircraft ?? "—"}</td>
                          <td className="px-2 py-1">{entry.engine ?? "—"}</td>
                          <td className="px-2 py-1">{entry.propeller ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TextFormatPreview({
  content,
  format,
}: {
  content: string;
  format: "csv" | "json";
}) {
  return (
    <div className="overflow-hidden rounded-md bg-[#1E1E38] ring-1 ring-black/[0.08]">
      <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-white/60">
        {format === "csv" ? "Comma-separated values" : "JSON document"}
      </div>
      <pre className="max-h-[min(400px,48vh)] overflow-auto p-3 text-[11px] leading-relaxed text-emerald-100/95 whitespace-pre-wrap break-all font-mono">
        {content}
      </pre>
    </div>
  );
}

export function LogbookExportPreview({
  report,
  format,
}: {
  report: LogbookExportReport;
  format: ExportFormat;
}) {
  if (format === "pdf") {
    return <PdfLayoutPreview report={report} />;
  }

  if (format === "csv") {
    return (
      <TextFormatPreview content={serializeLogbookExportCsv(report)} format="csv" />
    );
  }

  return (
    <TextFormatPreview content={serializeLogbookExportJson(report)} format="json" />
  );
}

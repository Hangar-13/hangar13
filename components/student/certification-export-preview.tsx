import type {
  CertificationExportReport,
  ExportFormat,
} from "@/lib/certification-export";
import {
  serializeCertificationExportCsv,
  serializeCertificationExportJson,
} from "@/lib/certification-export";
import { formatUiDate, formatUiDateTime } from "@/lib/format-ui-date";

function PdfLayoutPreview({ report }: { report: CertificationExportReport }) {
  return (
    <div className="space-y-5 rounded-md bg-white p-5 text-foreground shadow-inner ring-1 ring-black/[0.06]">
      <div className="h-1.5 rounded-full bg-primary" aria-hidden />
      <div className="space-y-1 border-b border-border/30 pb-4">
        <h3 className="text-lg font-bold leading-snug tracking-tight">{report.title}</h3>
        <p className="text-sm font-medium text-muted-foreground">{report.studentName}</p>
        <p className="text-xs text-muted-foreground">
          Generated {formatUiDate(report.generatedAt)}
          {" · "}
          {report.reportMode === "detailed" ? "Detailed report" : "Summary"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/40 bg-[#1E1E38] text-white">
              <th className="px-2 py-1.5 font-semibold">Section</th>
              <th className="px-2 py-1.5 font-semibold">Progress</th>
              <th className="px-2 py-1.5 font-semibold">Signed codes</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/20 bg-muted/15">
              <td className="px-2 py-1.5 font-medium">Overall</td>
              <td className="px-2 py-1.5 tabular-nums">{report.progress.overall.percentage}%</td>
              <td className="px-2 py-1.5 tabular-nums">
                {report.progress.overall.signed} / {report.progress.overall.required}
              </td>
            </tr>
            {report.progress.domains.map((d) => (
              <tr key={d.domain} className="border-b border-border/20">
                <td className="px-2 py-1.5">{d.sectionTitle}</td>
                <td className="px-2 py-1.5 tabular-nums">{d.percentage}%</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {d.signed} / {d.required}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.ataChapterSections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ATA chapters with covered codes match the current filters.
        </p>
      ) : (
        report.ataChapterSections.map((section) => (
          <section key={section.chapterNumber} className="space-y-2">
            <div>
              <h4 className="text-sm font-bold">{section.chapterLabel}</h4>
              <p className="text-xs font-medium text-muted-foreground">
                {section.codesCoveredCount} Codes Covered
              </p>
            </div>

            {report.reportMode === "detailed" ? (
              <div className="space-y-3">
                {section.codes.map((code) => (
                  <div
                    key={code.code}
                    className="overflow-hidden rounded-md ring-1 ring-black/[0.06]"
                  >
                    <div className="bg-primary/90 px-2 py-1.5 text-xs font-semibold text-[#1E1E38]">
                      {code.code}
                      <span className="ml-2 font-normal opacity-80">{code.description}</span>
                    </div>
                    {code.logs.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/30 text-muted-foreground">
                            <th className="px-2 py-1 text-left font-medium">Date</th>
                            <th className="px-2 py-1 text-left font-medium">Description</th>
                            <th className="px-2 py-1 text-left font-medium">Hrs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {code.logs.map((log, idx) => (
                            <tr key={idx} className="border-t border-border/20">
                              <td className="px-2 py-1 whitespace-nowrap">
                                {formatUiDate(log.date)}
                              </td>
                              <td className="px-2 py-1">{log.description}</td>
                              <td className="px-2 py-1 tabular-nums">{log.hours}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-2 py-2 text-xs text-muted-foreground">
                        No logbook entries in selected range.
                      </p>
                    )}
                    {code.signoff ? (
                      <p className="border-t border-border/20 px-2 py-1.5 text-[11px] text-muted-foreground">
                        Signature: {code.signoff.signerFullName} —{" "}
                        {formatUiDateTime(code.signoff.signedAt)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border/20 rounded-md ring-1 ring-black/[0.06]">
                {section.codes.map((code) => (
                  <li key={code.code} className="px-2 py-1.5 text-xs">
                    <span className="font-semibold">{code.code}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{code.description}</span>
                    {code.signoff ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Signed by {code.signoff.signerFullName} (
                        {formatUiDate(code.signoff.signedAt)})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
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

export function CertificationExportPreview({
  report,
  format,
}: {
  report: CertificationExportReport;
  format: ExportFormat;
}) {
  if (format === "pdf") {
    return <PdfLayoutPreview report={report} />;
  }

  if (format === "csv") {
    return (
      <TextFormatPreview content={serializeCertificationExportCsv(report)} format="csv" />
    );
  }

  return (
    <TextFormatPreview content={serializeCertificationExportJson(report)} format="json" />
  );
}

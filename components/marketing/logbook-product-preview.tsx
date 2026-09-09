import { Clock, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const ROWS: {
  date: string;
  task: string;
  hours: string;
  ata: string;
  acs: string;
  status: "signed" | "pending";
}[] = [
  {
    date: "Mar 12, 2026",
    task: "Turbine blade inspection",
    hours: "4.0h",
    ata: "72 — Engine",
    acs: "3",
    status: "signed",
  },
  {
    date: "Mar 11, 2026",
    task: "Landing gear retraction check",
    hours: "3.5h",
    ata: "32 — Landing gear",
    acs: "2",
    status: "signed",
  },
  {
    date: "Mar 10, 2026",
    task: "Hydraulic leak isolation",
    hours: "2.0h",
    ata: "29 — Hydraulic power",
    acs: "4",
    status: "pending",
  },
];

/**
 * Static preview of the real student logbook table, for the public landing page.
 * Not interactive — it should look like Hangar13, not a marketing illustration.
 */
export function LogbookProductPreview({
  caption,
}: {
  caption: string;
}) {
  return (
    <figure className="mx-auto max-w-[1440px]">
      <div
        className="overflow-hidden rounded-lg bg-[#F8F9FA] shadow-[0_24px_60px_rgba(18,20,23,.18)] ring-1 ring-black/10"
        aria-hidden
      >
        <div className="flex items-center justify-between border-b border-[#1E1E38]/10 bg-[#1E1E38] px-4 py-2.5">
          <p className="text-sm font-semibold text-white">
            Hangar<span className="text-[#FFCF03]">13</span>
            <span className="ml-3 font-normal text-white/70">Logbook</span>
          </p>
          <p className="hidden text-xs text-white/55 sm:block">Running total: 412.5 hours</p>
        </div>
        <div className="space-y-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <div className="h-9 rounded-md border border-[#6C5067]/30 bg-white pl-9 text-sm leading-9 text-[#6b7280]">
                Search logs...
              </div>
            </div>
            <div className="h-9 w-full rounded-md border border-[#6C5067]/30 bg-white px-3 text-sm leading-9 text-[#1E1E38] sm:w-[180px]">
              All status
            </div>
          </div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#6b7280]">
            Logbook entries
          </p>
          <div className="overflow-x-auto rounded-md bg-white ring-1 ring-black/[0.04]">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b border-black/10 bg-[#9CA69E]/15">
                  {["Date", "Task", "Hours", "ATA chapter", "ACS", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-sm font-semibold text-[#1E1E38]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.task} className="border-b border-black/[0.06] last:border-0">
                    <td className="px-4 py-3 text-sm text-[#1E1E38]">{row.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-[#1E1E38]">{row.task}</td>
                    <td className="px-4 py-3 text-sm font-semibold tabular-nums text-[#0098C7]">
                      {row.hours}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#6b7280]">{row.ata}</td>
                    <td className="px-4 py-3 text-sm text-[#1E1E38] underline decoration-dotted">
                      {row.acs}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
                          row.status === "signed"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {row.status === "signed" ? "Signed" : "Pending signature"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-md bg-[#FFCF03] px-3 py-2 text-sm font-medium text-[#1E1E38]">
              <Plus className="mr-2 h-4 w-4" />
              Add entry
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#9CA69E]/30 px-4 py-2 text-sm font-medium text-[#1E1E38]">
              <Clock className="h-4 w-4" />
              Running total: 412.5 hours
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-5 max-w-2xl text-base leading-7 text-[#515860]">
        {caption}
      </figcaption>
    </figure>
  );
}

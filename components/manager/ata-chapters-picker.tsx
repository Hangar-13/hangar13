"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export type AtaChapterPickerRow = {
  id: number;
  chapter_number: string;
  title: string;
  description: string | null;
};

type Props = {
  chapters: AtaChapterPickerRow[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  idPrefix?: string;
  /** Puts label and search on one row (e.g. create-lesson modal). */
  sectionLabel?: string;
};

function searchMatch(c: AtaChapterPickerRow, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [c.chapter_number, c.title, c.description ?? ""]
    .join(" ")
    .toLowerCase();
  return s.split(/\s+/).every((w) => w.length > 0 && hay.includes(w));
}

export function AtaChaptersPicker({
  chapters,
  selectedIds,
  onChange,
  disabled,
  idPrefix = "ata",
  sectionLabel,
}: Props) {
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(
    () => chapters.filter((c) => searchMatch(c, search)),
    [chapters, search]
  );

  function toggle(id: number) {
    if (disabled) return;
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  const searchField = (
    <Input
      type="search"
      placeholder="Search by chapter number or title…"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      disabled={disabled}
      className={sectionLabel ? "min-w-0 flex-1" : "max-w-md"}
      aria-label="Filter ATA chapters"
    />
  );

  const countLine = (
    <p className="text-xs text-muted-foreground">
      {selectedIds.length} selected
    </p>
  );

  const table = (
    <div className="border rounded-md overflow-auto max-h-64 text-sm">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 border-b border-border/60 bg-muted shadow-sm">
            <tr>
              <th
                className="p-2 w-10 bg-muted"
                aria-label="Select"
              />
              <th className="p-2 font-medium bg-muted">Chapter</th>
              <th className="p-2 font-medium min-w-[10rem] bg-muted">
                Title
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-4 text-muted-foreground text-center">
                  No chapters match your search.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const checked = selectedSet.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="p-1.5 align-top">
                      <div className="flex justify-center pt-0.5">
                        <input
                          id={`${idPrefix}-ch-${c.id}`}
                          type="checkbox"
                          className="size-4 rounded border border-input"
                          checked={checked}
                          onChange={() => toggle(c.id)}
                          disabled={disabled}
                          aria-label={`Select chapter ${c.chapter_number}`}
                        />
                      </div>
                    </td>
                    <td className="p-2 align-top font-mono text-xs font-medium tabular-nums">
                      {c.chapter_number}
                    </td>
                    <td className="p-2 align-top text-xs max-w-[20rem]">
                      <span className="line-clamp-2" title={c.title}>
                        {c.title}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
  );

  if (sectionLabel) {
    return (
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-row flex-wrap items-center gap-3">
          <span className="w-32 shrink-0 text-sm font-medium text-muted-foreground">
            {sectionLabel}
          </span>
          <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
            {searchField}
            <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
              {selectedIds.length} selected
            </span>
          </div>
        </div>
        {table}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      {searchField}
      {countLine}
      {table}
    </div>
  );
}

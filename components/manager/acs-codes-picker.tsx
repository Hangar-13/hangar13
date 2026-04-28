"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { sortByAcsCode } from "@/lib/acs-code-sort";

/** Serialized ACS row for the manager picker (matches AcsCodeWithChapters without server-only types). */
export type AcsCodePickerRow = {
  id: number;
  code: string;
  domain: string;
  subject: string;
  description: string;
  ata_chapter_numbers: string[];
};

type Props = {
  codes: AcsCodePickerRow[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  idPrefix?: string;
  /** Puts label and search on one row (e.g. create-lesson modal, lesson page edit). */
  sectionLabel?: string;
  /** Renders after the section label (same row, before the search), e.g. an icon button. */
  labelSuffix?: ReactNode;
};

function searchMatch(c: AcsCodePickerRow, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [
    c.code,
    c.domain,
    c.subject,
    c.description,
    c.ata_chapter_numbers.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return s.split(/\s+/).every((w) => w.length > 0 && hay.includes(w));
}

export function AcsCodesPicker({
  codes,
  selectedIds,
  onChange,
  disabled,
  idPrefix = "acs",
  sectionLabel,
  labelSuffix,
}: Props) {
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(
    () => sortByAcsCode(codes.filter((c) => searchMatch(c, search))),
    [codes, search]
  );

  function toggle(id: number) {
    if (disabled) return;
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  const searchInputClass = sectionLabel
    ? "h-8 min-w-0 w-full flex-1 sm:max-w-xs bg-white dark:bg-white"
    : "h-8 w-full min-w-0 sm:max-w-xs bg-white dark:bg-white";

  const searchField = (
    <Input
      type="search"
      placeholder="Search by code, subject, domain, ATA…"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      disabled={disabled}
      className={searchInputClass}
      aria-label="Filter ACS codes"
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
              <th className="p-2 font-medium bg-muted">Code</th>
              <th className="p-2 font-medium bg-muted">Domain</th>
              <th className="p-2 font-medium bg-muted">Subject</th>
              <th className="p-2 font-medium min-w-[8rem] bg-muted">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground text-center">
                  No codes match your search.
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
                          id={`${idPrefix}-acs-${c.id}`}
                          type="checkbox"
                          className="size-4 rounded border border-input"
                          checked={checked}
                          onChange={() => toggle(c.id)}
                          disabled={disabled}
                          aria-label={`Select ${c.code}`}
                        />
                      </div>
                    </td>
                    <td className="p-2 align-top font-mono text-xs font-medium">
                      {c.code}
                    </td>
                    <td className="p-2 align-top capitalize text-xs">
                      {c.domain}
                    </td>
                    <td className="p-2 align-top text-xs max-w-[10rem]">
                      <span className="line-clamp-2" title={c.subject}>
                        {c.subject}
                      </span>
                    </td>
                    <td className="p-2 align-top text-xs text-muted-foreground max-w-md">
                      <span className="line-clamp-2" title={c.description}>
                        {c.description}
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
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 items-center gap-1 shrink-0">
            <span className="w-32 shrink-0 text-sm font-medium text-muted-foreground">
              {sectionLabel}
            </span>
            {labelSuffix}
          </div>
          <div className="flex min-w-0 w-full flex-1 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2 sm:pl-0">
            {searchField}
            <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap sm:text-right">
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
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="w-32 shrink-0 text-sm font-medium text-muted-foreground">ACS codes</span>
        <div className="min-w-0 w-full sm:flex sm:flex-1 sm:max-w-xs sm:justify-end">
          {searchField}
        </div>
      </div>
      {countLine}
      {table}
    </div>
  );
}

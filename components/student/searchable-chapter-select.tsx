"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchableChapterOption = { value: string; label: string };

type Props = {
  id?: string;
  value: string;
  /** Client callback when the user picks a chapter (name ends with Action for Next.js prop lint). */
  onChapterSelectAction: (value: string) => void;
  options: SearchableChapterOption[];
  disabled?: boolean;
  placeholder?: string;
  "aria-invalid"?: boolean;
};

export function SearchableChapterSelect({
  id,
  value,
  onChapterSelectAction,
  options,
  disabled = false,
  placeholder = "Select ATA Chapter",
  "aria-invalid": ariaInvalid,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
    );
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  if (disabled) {
    return (
      <div
        id={id}
        className="border-input flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs opacity-50"
      >
        <span className="truncate text-left">{selectedLabel ?? placeholder}</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-invalid={ariaInvalid}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "border-input data-[placeholder]:text-muted-foreground flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-input dark:bg-input/30",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
        )}
      >
        <span
          className={cn("min-w-0 flex-1 truncate", !selectedLabel && "text-muted-foreground")}
        >
          {selectedLabel ?? placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div
          className="bg-popover text-popover-foreground absolute top-full z-[100] mt-1 w-full min-w-0 overflow-hidden rounded-md border shadow-md"
        >
          <div className="border-b p-1.5">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                className="h-8 pl-8 text-sm"
                placeholder="Search by number or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
                aria-label="Filter ATA chapters"
              />
            </div>
          </div>
          <ul
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            className="max-h-[min(16rem,40vh)] overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">No matching chapters</li>
            ) : (
              filtered.map((ch) => {
                const selected = ch.value === value;
                return (
                  <li key={ch.value} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                        selected && "bg-accent/60"
                      )}
                      onClick={() => {
                        onChapterSelectAction(ch.value);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{ch.label}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 opacity-90" aria-hidden />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

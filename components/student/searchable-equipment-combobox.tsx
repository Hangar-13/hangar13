"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  searchLogbookEquipmentCatalog,
  type LogbookEquipmentKind,
} from "@/app/actions/logbook-equipment-catalog";

type Props = {
  id?: string;
  equipmentKind: LogbookEquipmentKind;
  value: string;
  /** Client callback when the value changes or the user picks a suggestion (Next.js prop lint). */
  onValuePickAction: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  createNewPrefix?: string;
  /** Show a control to clear the value (optional logbook fields). */
  allowClear?: boolean;
  "aria-invalid"?: boolean;
};

export function SearchableEquipmentCombobox({
  id,
  equipmentKind,
  value,
  onValuePickAction,
  onBlur,
  disabled = false,
  placeholder = "Search catalog or type a new value…",
  createNewPrefix = "Create new:",
  allowClear = true,
  "aria-invalid": ariaInvalid,
}: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const blurCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelBlurClose = () => {
    if (blurCloseTimerRef.current != null) {
      clearTimeout(blurCloseTimerRef.current);
      blurCloseTimerRef.current = null;
    }
  };

  const listboxId = id ? `${id}-listbox` : "equipment-catalog-listbox";
  const displayValue = value.trim();
  const queryTrim = value.trim();

  const exactMatchInOptions = useMemo(
    () => options.some((o) => o.toLowerCase() === queryTrim.toLowerCase()),
    [options, queryTrim]
  );

  const showCreateNewRow =
    queryTrim.length > 0 &&
    queryTrim.length <= 200 &&
    !exactMatchInOptions &&
    !loading;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setFetchError(null);
        const res = await searchLogbookEquipmentCatalog(equipmentKind, value);
        if (cancelled) return;
        setLoading(false);
        if ("error" in res) {
          setFetchError(res.error);
          setOptions([]);
        } else {
          setOptions(res.labels);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, equipmentKind, value]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (blurCloseTimerRef.current != null) {
        clearTimeout(blurCloseTimerRef.current);
        blurCloseTimerRef.current = null;
      }
    };
  }, []);

  const handleFocus = () => {
    cancelBlurClose();
    setOpen(true);
  };

  const handleBlur = () => {
    blurCloseTimerRef.current = setTimeout(() => {
      setOpen(false);
      blurCloseTimerRef.current = null;
    }, 120);
    onBlur?.();
  };

  if (disabled) {
    return (
      <div
        id={id}
        className="border-input flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs opacity-50"
      >
        <span className="truncate text-left">
          {displayValue || placeholder}
        </span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={ariaInvalid}
        autoComplete="off"
        maxLength={200}
        value={value}
        onChange={(e) => onValuePickAction(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "h-9 min-w-0 flex-1 bg-white dark:bg-white",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
        )}
      />
      {open && (
        <div
          className="bg-popover text-popover-foreground absolute top-full z-[100] mt-0.5 w-full min-w-0 overflow-hidden rounded-md border shadow-md"
        >
          <ul id={listboxId} role="listbox" className="max-h-[min(16rem,40vh)] overflow-y-auto p-1">
            {allowClear && displayValue.length > 0 && (
              <li role="option" aria-selected="false">
                <button
                  type="button"
                  className={cn(
                    "flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:bg-accent focus:text-accent-foreground focus:outline-none"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    cancelBlurClose();
                    onValuePickAction("");
                    setOpen(true);
                    requestAnimationFrame(() => {
                      const inputEl =
                        rootRef.current?.querySelector("input[data-slot=input]");
                      if (inputEl instanceof HTMLInputElement) {
                        inputEl.focus();
                      }
                    });
                  }}
                >
                  Clear selection
                </button>
              </li>
            )}
            {loading && (
              <li className="px-2 py-2 text-center text-sm text-muted-foreground">
                Loading…
              </li>
            )}
            {!loading && fetchError && (
              <li className="px-2 py-2 text-center text-sm text-destructive">
                {fetchError}
              </li>
            )}
            {!loading && !fetchError && showCreateNewRow && (
              <li role="option" aria-selected="false">
                <button
                  type="button"
                  className={cn(
                    "flex w-full cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:bg-accent focus:text-accent-foreground focus:outline-none"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    cancelBlurClose();
                    onValuePickAction(queryTrim);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {createNewPrefix}{" "}
                    <span className="font-medium">&quot;{queryTrim}&quot;</span>
                  </span>
                </button>
              </li>
            )}
            {!loading &&
              !fetchError &&
              options.map((opt) => {
                const selected =
                  displayValue.length > 0 &&
                  opt.toLowerCase() === displayValue.toLowerCase();
                return (
                  <li key={opt} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                        selected && "bg-accent/60"
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        cancelBlurClose();
                        onValuePickAction(opt);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{opt}</span>
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            {!loading && !fetchError && options.length === 0 && !showCreateNewRow && (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                {queryTrim.length > 0
                  ? "No saved suggestions for this search."
                  : "Catalog is empty — type a label to add one on save."}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatUiDate, parseUiDateToIso } from "@/lib/format-ui-date";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  name?: string;
  value: string;
  onChange: (isoDate: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  className?: string;
};

export function AviationDateInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled,
  "aria-invalid": ariaInvalid,
  className,
}: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => (value ? formatUiDate(value) : ""));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (focused) return;
    if (!value) {
      setText("");
      return;
    }
    const formatted = formatUiDate(value);
    if (formatted !== "—") setText(formatted);
  }, [focused, value]);

  function commit(nextText: string) {
    const parsed = parseUiDateToIso(nextText);
    if (parsed == null) {
      setError("Use DD-MMM-YYYY, for example 14-Nov-2026.");
      return;
    }
    setError(null);
    onChange(parsed);
    setText(parsed ? formatUiDate(parsed) : "");
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker || disabled) return;
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        picker.focus();
        return;
      }
    }
    picker.focus();
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <Input
        id={id}
        name={name}
        value={text}
        placeholder="DD-MMM-YYYY"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={ariaInvalid || error ? true : undefined}
        className="pr-10"
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
          onBlur?.();
        }}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground disabled:opacity-50"
        aria-label="Choose date"
        disabled={disabled}
        onClick={openPicker}
      >
        <Calendar className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        className="sr-only"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setError(null);
          onChange(next);
          setText(next ? formatUiDate(next) : "");
        }}
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

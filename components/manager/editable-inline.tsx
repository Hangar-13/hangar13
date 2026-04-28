"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type EditableInlineProps = {
  value: string;
  onSave: (next: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  multiline?: boolean;
  placeholder?: string;
  displayClassName?: string;
  inputClassName?: string;
  /** Screen reader label for the edit control */
  label: string;
};

export function EditableInline({
  value,
  onSave,
  multiline,
  placeholder,
  displayClassName,
  inputClassName,
  label,
}: EditableInlineProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function cancel() {
    setDraft(value);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await onSave(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  if (editing) {
    const Field = multiline ? Textarea : Input;
    return (
      <div className="space-y-2 w-full min-w-0 max-w-2xl">
        <Field
          value={draft}
          onChange={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (!multiline && e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          disabled={pending}
          className={cn(multiline && "min-h-[120px] resize-y", inputClassName)}
          placeholder={placeholder}
          aria-label={label}
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={cancel}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group inline-flex items-start gap-1 w-fit max-w-full self-start">
      <div
        className={cn(
          "max-w-2xl min-w-0 whitespace-pre-wrap break-words",
          !value && "text-muted-foreground italic",
          displayClassName
        )}
      >
        {value || placeholder || "—"}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
      >
        <Pencil className="size-2" aria-hidden />
      </Button>
    </div>
  );
}

type EditableInlineNumberProps = {
  value: number;
  onSave: (next: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  label: string;
};

export function EditableInlineNumber({
  value,
  onSave,
  label,
}: EditableInlineNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  function cancel() {
    setDraft(String(value));
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    const n = Number.parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter a positive whole number.");
      return;
    }
    startTransition(async () => {
      const result = await onSave(n);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 flex items-start gap-2">
        <Input
          type="number"
          min={1}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (e.key === "Enter") save();
          }}
          disabled={pending}
          className="w-24"
          aria-label={label}
        />
        {error ? (
          <p className="text-sm text-destructive self-center" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={cancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="group inline-flex items-center gap-1 w-fit max-w-full self-start">
      <span className="font-medium tabular-nums">{value}</span>
      <Button
        type="button"
        variant="ghost"
        className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
      >
        <Pencil className="size-2" aria-hidden />
      </Button>
    </div>
  );
}

/** Hours for a lesson (0+, up to 2 decimal places). */
export function EditableLessonHours({
  value,
  onSave,
  label,
}: {
  value: number;
  onSave: (next: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  function cancel() {
    setDraft(String(value));
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    const n = Number.parseFloat(draft);
    if (!Number.isFinite(n) || n < 0 || n > 99999) {
      setError("Enter hours from 0 to 99999.");
      return;
    }
    const rounded = Math.round(n * 100) / 100;
    startTransition(async () => {
      const result = await onSave(rounded);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  const display = Number.isFinite(value) ? value.toLocaleString() : "0";

  if (editing) {
    return (
      <div className="space-y-2 flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={0}
          max={99999}
          step={0.25}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (e.key === "Enter") save();
          }}
          disabled={pending}
          className="w-28"
          aria-label={label}
        />
        <span className="text-sm text-muted-foreground">hours</span>
        {error ? (
          <p className="text-sm text-destructive w-full" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={cancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="group inline-flex items-center gap-1 flex-wrap">
      <span className="font-medium tabular-nums">{display}</span>
      <span className="text-sm text-muted-foreground">hours</span>
      <Button
        type="button"
        variant="ghost"
        className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
      >
        <Pencil className="size-2" aria-hidden />
      </Button>
    </div>
  );
}

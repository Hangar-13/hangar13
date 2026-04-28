"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ManagerMarkdownTextarea } from "@/components/manager/manager-markdown-textarea";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onSave: (next: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Section heading (e.g. "Study Materials"), shown next to the edit control */
  title: string;
  placeholder?: string;
  displayClassName?: string;
  /**
   * Accessible name for the field; defaults to `title` if omitted.
   * e.g. aria-label for edit button and write tab.
   */
  label?: string;
  /** e.g. les-study for id prefix */
  id: string;
};

export function EditableMarkdownField({
  value,
  onSave,
  placeholder = "Optional",
  displayClassName,
  title,
  label: labelProp,
  id,
}: Props) {
  const label = labelProp ?? title;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const body = !value.trim() ? (
    <p className="text-sm text-muted-foreground italic whitespace-pre-wrap">
      {placeholder}
    </p>
  ) : (
    <MarkdownContent markdown={value} className={cn("text-foreground", displayClassName)} />
  );

  if (editing) {
    return (
      <div className="space-y-2 w-full min-w-0 max-w-3xl">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <ManagerMarkdownTextarea
          id={id}
          value={draft}
          onChange={setDraft}
          disabled={pending}
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
    <div className="space-y-2 w-full min-w-0 max-w-3xl">
      <div className="group flex items-center gap-1 min-w-0">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <Button
          type="button"
          variant="ghost"
          className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
          onClick={() => {
            setDraft(value);
            setError(null);
            setEditing(true);
          }}
          aria-label={`Edit ${label}`}
        >
          <Pencil className="size-2" aria-hidden />
        </Button>
      </div>
      <div className="min-w-0 rounded-md">{body}</div>
    </div>
  );
}

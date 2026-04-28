"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type StringListRow = { id: string; text: string };

function newRowId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function rowsFromStrings(items: string[]): StringListRow[] {
  return items.map((text) => ({ id: newRowId(), text }));
}

export function stringsFromRows(rows: StringListRow[]): string[] {
  return rows.map((r) => r.text.trim()).filter(Boolean);
}

type Props = {
  rows: StringListRow[];
  onChange: (rows: StringListRow[]) => void;
  disabled?: boolean;
  addLabel?: string;
  itemPlaceholder?: string;
  /** e.g. "learning-obj" for first textarea id */
  idPrefix: string;
};

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

export function ManagerStringListEditor({
  rows,
  onChange,
  disabled,
  addLabel = "Add item",
  itemPlaceholder,
  idPrefix,
}: Props) {
  function updateText(index: number, text: string) {
    onChange(
      rows.map((r, i) => (i === index ? { ...r, text } : r))
    );
  }

  function removeAt(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    onChange(move(rows, index, index - 1));
  }

  function moveDown(index: number) {
    if (index >= rows.length - 1) return;
    onChange(move(rows, index, index + 1));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No items yet.</p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id} className="flex gap-2 min-w-0">
            <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={disabled || index === 0}
                onClick={() => moveUp(index)}
                aria-label="Move up"
              >
                <ChevronUp className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={disabled || index === rows.length - 1}
                onClick={() => moveDown(index)}
                aria-label="Move down"
              >
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </div>
            <Textarea
              id={`${idPrefix}-${row.id}`}
              value={row.text}
              onChange={(e) => updateText(index, e.target.value)}
              disabled={disabled}
              placeholder={itemPlaceholder}
              rows={2}
              className="min-h-[64px] resize-y min-w-0 flex-1 text-sm"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 mt-0.5 shrink-0 self-start text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => removeAt(index)}
              aria-label="Remove"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={disabled}
        onClick={() => onChange([...rows, { id: newRowId(), text: "" }])}
      >
        <Plus className="size-4" aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

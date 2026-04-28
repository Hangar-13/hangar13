"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { updateLessonFields } from "@/app/actions/manager-training-content";
import { Button } from "@/components/ui/button";
import {
  ManagerStringListEditor,
  rowsFromStrings,
  stringsFromRows,
  type StringListRow,
} from "@/components/manager/manager-string-list-editor";

type StringListField = "learning_objectives" | "mentor_discussion_questions";

type Props = {
  lessonId: string;
  label: string;
  items: string[];
  field: StringListField;
  onSaved: () => void;
  addItemLabel: string;
  itemPlaceholder: string;
  idPrefix: string;
};

export function ManagerLessonStringListSection({
  lessonId,
  label,
  items,
  field,
  onSaved,
  addItemLabel,
  itemPlaceholder,
  idPrefix,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StringListRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(rowsFromStrings(items));
    }
  }, [items, editing]);

  function cancel() {
    setDraft(rowsFromStrings(items));
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    const asStrings = stringsFromRows(draft);
    startTransition(async () => {
      const patch =
        field === "learning_objectives"
          ? { learning_objectives: asStrings }
          : { mentor_discussion_questions: asStrings };
      const r = await updateLessonFields(lessonId, patch);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      onSaved();
    });
  }

  return (
    <div className="space-y-2">
      <div className="group flex items-center gap-1 min-w-0">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
            onClick={() => {
              setDraft(rowsFromStrings(items));
              setError(null);
              setEditing(true);
            }}
            aria-label={`Edit ${label}`}
          >
            <Pencil className="size-2" aria-hidden />
          </Button>
        ) : null}
      </div>
      {!editing ? (
        items.length > 0 ? (
          <ol className="list-decimal pl-5 space-y-1.5 text-sm">
            {items.map((t, i) => (
              <li key={i} className="pl-0.5">
                {t}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground italic">None</p>
        )
      ) : (
        <div className="space-y-3 max-w-3xl">
          <ManagerStringListEditor
            idPrefix={idPrefix}
            rows={draft}
            onChange={setDraft}
            disabled={pending}
            addLabel={addItemLabel}
            itemPlaceholder={itemPlaceholder}
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save"}
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
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { updateLessonFields } from "@/app/actions/manager-training-content";
import { Button } from "@/components/ui/button";
import {
  AtaChaptersPicker,
  type AtaChapterPickerRow,
} from "@/components/manager/ata-chapters-picker";

type Props = {
  lessonId: string;
  ataChapterIds: number[];
  catalog: AtaChapterPickerRow[];
  onSaved: () => void;
};

export function ManagerLessonAtaChaptersSection({
  lessonId,
  ataChapterIds,
  catalog,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number[]>(ataChapterIds);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(ataChapterIds);
  }, [ataChapterIds, editing]);

  const idToRow = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const displayRows = useMemo(() => {
    return ataChapterIds
      .map((id) => idToRow.get(id))
      .filter((c): c is AtaChapterPickerRow => c != null);
  }, [ataChapterIds, idToRow]);

  function cancel() {
    setDraft(ataChapterIds);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateLessonFields(lessonId, { ata_chapter_ids: draft });
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
        <div className="text-sm font-medium text-muted-foreground">
          ATA Chapter
        </div>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
            onClick={() => {
              setDraft(ataChapterIds);
              setError(null);
              setEditing(true);
            }}
            aria-label="Edit ATA chapters"
          >
            <Pencil className="size-2" aria-hidden />
          </Button>
        ) : null}
      </div>
      {!editing ? (
        displayRows.length ? (
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            {displayRows.map((c) => (
              <li key={c.id}>
                <span className="font-mono font-medium tabular-nums">
                  {c.chapter_number}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  — {c.title}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">None selected</p>
        )
      ) : (
        <div className="space-y-3">
          <AtaChaptersPicker
            chapters={catalog}
            selectedIds={draft}
            onChange={setDraft}
            disabled={pending}
            idPrefix="lesson-ata"
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

"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Pencil } from "lucide-react";
import { updateLessonFields } from "@/app/actions/manager-training-content";
import { Button } from "@/components/ui/button";
import {
  AcsCodesPicker,
  type AcsCodePickerRow,
} from "@/components/manager/acs-codes-picker";
import { sortByAcsCode } from "@/lib/acs-code-sort";

type Props = {
  lessonId: string;
  acsCodes: number[];
  catalog: AcsCodePickerRow[];
  onSaved: () => void;
  /** Fires after a successful save that set ACS to none (e.g. hide parent "include" toggle). */
  onClearedAcsInDb?: () => void;
  /**
   * When this value increases (e.g. parent increments when enabling ACS on the lesson page),
   * the section opens in edit mode. Initial 0 does nothing.
   */
  openInEditModeToken?: number;
};

export function ManagerLessonAcsCodesSection({
  lessonId,
  acsCodes,
  catalog,
  onSaved,
  onClearedAcsInDb,
  openInEditModeToken = 0,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number[]>(acsCodes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const lastOpenEditToken = useRef(0);

  useLayoutEffect(() => {
    if (openInEditModeToken <= 0) return;
    if (openInEditModeToken <= lastOpenEditToken.current) return;
    lastOpenEditToken.current = openInEditModeToken;
    setDraft(acsCodes);
    setError(null);
    setEditing(true);
  }, [openInEditModeToken, acsCodes]);

  useEffect(() => {
    if (!editing) setDraft(acsCodes);
  }, [acsCodes, editing]);

  const idToRow = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const displayRows = useMemo(() => {
    return sortByAcsCode(
      acsCodes
        .map((id) => idToRow.get(id))
        .filter((c): c is AcsCodePickerRow => c != null)
    );
  }, [acsCodes, idToRow]);

  function cancel() {
    setDraft(acsCodes);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateLessonFields(lessonId, { acs_codes: draft });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      if (draft.length === 0) {
        onClearedAcsInDb?.();
      }
      onSaved();
    });
  }

  return (
    <div className="space-y-2">
      {!editing ? (
        <>
          <div className="group flex items-center gap-1 min-w-0">
            <div className="text-sm font-medium text-muted-foreground">ACS Codes</div>
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
              onClick={() => {
                setDraft(acsCodes);
                setError(null);
                setEditing(true);
              }}
              aria-label="Edit ACS codes"
            >
              <Pencil className="size-2" aria-hidden />
            </Button>
          </div>
          {displayRows.length ? (
            <ul className="list-disc pl-5 space-y-1.5 text-sm">
              {displayRows.map((c) => (
                <li key={c.id}>
                  <span className="font-mono font-medium">{c.code}</span>
                  {c.description ? (
                    <span className="text-muted-foreground">
                      {" "}
                      — {c.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">None selected</p>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <AcsCodesPicker
            codes={catalog}
            selectedIds={draft}
            onChange={setDraft}
            disabled={pending}
            idPrefix="lesson-edit"
            sectionLabel="ACS Codes"
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

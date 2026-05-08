"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CatalogVisibilityBadge } from "@/components/manager/catalog-visibility-badge";
import {
  CATALOG_VISIBILITY_VALUES,
  catalogVisibilityBriefHint,
  catalogVisibilityEditorExplanation,
  catalogVisibilityTitle,
  type CatalogVisibility,
  type CatalogVisibilityEntityKind,
} from "@/lib/catalog-visibility";

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  entityKind: CatalogVisibilityEntityKind;
  visibility: CatalogVisibility;
  onSave: (next: CatalogVisibility) => Promise<SaveResult>;
  onSaved?: () => void;
};

export function VisibilitySectionEditor({
  entityKind,
  visibility,
  onSave,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CatalogVisibility>(visibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!editing) setDraft(visibility);
  }, [visibility, editing]);

  function startEdit() {
    setError(null);
    setDraft(visibility);
    setEditing(true);
  }

  function cancelEdit() {
    setError(null);
    setDraft(visibility);
    setEditing(false);
  }

  function acceptEdit() {
    setError(null);
    if (draft === visibility) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const r = await onSave(draft);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      onSaved?.();
    });
  }

  return (
    <div className="space-y-2">
      {!editing ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium text-muted-foreground shrink-0">
            Visibility
          </span>
          <div className="group flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <CatalogVisibilityBadge visibility={visibility} />
            <span className="text-sm text-muted-foreground" aria-hidden>
              -
            </span>
            <p className="text-sm text-muted-foreground">
              {catalogVisibilityBriefHint(visibility, entityKind)}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100 text-muted-foreground"
              onClick={startEdit}
              aria-label="Edit visibility"
              title="Edit visibility"
            >
              <Pencil className="size-2" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <span className="text-sm font-medium text-muted-foreground">
            Visibility
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={draft}
              onValueChange={(v) => setDraft(v as CatalogVisibility)}
              disabled={pending}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATALOG_VISIBILITY_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {catalogVisibilityTitle(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={acceptEdit}
              disabled={pending}
            >
              {pending ? "Saving…" : "Accept"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={cancelEdit}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
          <p
            className="text-sm text-muted-foreground max-w-xl leading-relaxed"
            aria-live="polite"
          >
            {catalogVisibilityEditorExplanation(draft, entityKind)}
          </p>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

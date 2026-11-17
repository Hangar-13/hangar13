"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  updateTrainingPathFields,
  reorderTrainingPathItems,
  deleteTrainingPathItemRows,
} from "@/app/actions/manager-training-path";
import { Button } from "@/components/ui/button";
import { EditableInline } from "@/components/manager/editable-inline";
import { ManagerContentLevelBar } from "@/components/manager/manager-content-level-bar";
import {
  TrainingPathMap,
  type TrainingPathMapItem,
} from "@/components/manager/training-path-map";
import { AddTrainingContentModal } from "@/components/manager/add-training-content-modal";
import { VisibilitySectionEditor } from "@/components/manager/visibility-section-editor";
import type { TrainingContentCatalogCourse } from "@/lib/manager-training-catalog";
import type { CatalogVisibility } from "@/lib/catalog-visibility";
import {
  DashboardContentFrame,
  DashboardPageShell,
  DashboardSectionLabel,
} from "@/components/dashboard/page-shell";

type Props = {
  path: {
    id: string;
    name: string;
    description: string | null;
    visibility: CatalogVisibility;
    isApprenticeProgram: boolean;
    ojtMonthsRequired: number | null;
  };
  mapItems: TrainingPathMapItem[];
  catalog: TrainingContentCatalogCourse[];
  existingKeys: string[];
};

export function ManagerTrainingPathDetailClient({
  path,
  mapItems,
  catalog,
  existingKeys,
}: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [mapEditing, setMapEditing] = useState(false);
  const [orderDraft, setOrderDraft] = useState<string[]>([]);
  const [pendingRemoveItemIds, setPendingRemoveItemIds] = useState<string[]>(
    []
  );
  const [mapError, setMapError] = useState<string | null>(null);
  const [apprenticeProgram, setApprenticeProgram] = useState(path.isApprenticeProgram);
  const [monthsRequired, setMonthsRequired] = useState(
    path.ojtMonthsRequired != null ? String(path.ojtMonthsRequired) : ""
  );
  const [apprenticeError, setApprenticeError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveApprenticeSettings(nextProgram: boolean, monthsText: string) {
    setApprenticeError(null);
    const months = Number(monthsText);
    startTransition(async () => {
      const result = await updateTrainingPathFields(path.id, {
        isApprenticeProgram: nextProgram,
        ojtMonthsRequired: nextProgram ? months : null,
      });
      if (!result.ok) {
        setApprenticeError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function beginMapEdit() {
    const sorted = [...mapItems].sort((a, b) => a.sortOrder - b.sortOrder);
    setOrderDraft(sorted.map((i) => i.itemId));
    setPendingRemoveItemIds([]);
    setMapError(null);
    setMapEditing(true);
  }

  function cancelMapEdit() {
    setMapEditing(false);
    setOrderDraft([]);
    setPendingRemoveItemIds([]);
    setMapError(null);
  }

  function removePathItemRow(itemId: string) {
    setOrderDraft((prev) => prev.filter((id) => id !== itemId));
    setPendingRemoveItemIds((prev) =>
      prev.includes(itemId) ? prev : [...prev, itemId]
    );
  }

  function acceptMapEdit() {
    setMapError(null);
    startTransition(async () => {
      if (pendingRemoveItemIds.length > 0) {
        const rD = await deleteTrainingPathItemRows(
          path.id,
          pendingRemoveItemIds
        );
        if (!rD.ok) {
          setMapError(rD.error);
          return;
        }
      }
      if (orderDraft.length > 0) {
        const r = await reorderTrainingPathItems(path.id, orderDraft);
        if (!r.ok) {
          setMapError(r.error);
          return;
        }
      } else if (pendingRemoveItemIds.length === 0) {
        // no-op
      }
      cancelMapEdit();
      router.refresh();
    });
  }

  return (
    <DashboardPageShell>
      <ManagerContentLevelBar
        level="trainingPath"
        pathName={path.name}
      />

      <header className="space-y-3">
        <EditableInline
          label="Training path title"
          value={path.name}
          displayClassName="text-2xl font-bold tracking-tight"
          placeholder="Title"
          onSave={async (name) => {
            const r = await updateTrainingPathFields(path.id, { name });
            if (r.ok) router.refresh();
            return r;
          }}
        />
        <EditableInline
          label="Training path description"
          value={path.description ?? ""}
          multiline
          placeholder="Describe this training path"
          onSave={async (description) => {
            const r = await updateTrainingPathFields(path.id, {
              description: description.trim() || null,
            });
            if (r.ok) router.refresh();
            return r;
          }}
        />
        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={apprenticeProgram}
              disabled={pending}
              onChange={(event) => {
                const checked = event.target.checked;
                setApprenticeProgram(checked);
                if (!checked) saveApprenticeSettings(false, monthsRequired);
              }}
            />
            <span>
              <span className="font-medium">Apprentice program</span>
              <span className="mt-0.5 block text-muted-foreground">
                Apprentices on this path track months of OJT. Unchecked by default.
              </span>
            </span>
          </label>
          {apprenticeProgram ? (
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="ojt-months-required">Months required</Label>
              <div className="flex gap-2">
                <Input
                  id="ojt-months-required"
                  inputMode="numeric"
                  value={monthsRequired}
                  onChange={(event) => setMonthsRequired(event.target.value.replace(/[^\d]/g, ""))}
                />
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => saveApprenticeSettings(true, monthsRequired)}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : null}
          {apprenticeError ? (
            <p className="text-sm text-destructive" role="alert">
              {apprenticeError}
            </p>
          ) : null}
          <VisibilitySectionEditor
            entityKind="trainingPath"
            visibility={path.visibility}
            onSave={async (next) =>
              updateTrainingPathFields(path.id, { visibility: next })
            }
            onSaved={() => router.refresh()}
          />
        </div>
      </header>

      <DashboardContentFrame className="space-y-4">
      <section className="space-y-4">
        <div className="group flex flex-wrap items-center gap-1 min-w-0">
          <DashboardSectionLabel className="mb-0">Training path map</DashboardSectionLabel>
          {!mapEditing ? (
            <Button
              type="button"
              variant="ghost"
              className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
              onClick={beginMapEdit}
              disabled={mapItems.length === 0}
              aria-label="Edit lesson map"
              title={
                mapItems.length === 0
                  ? "Add content before editing the map"
                  : "Edit lesson map"
              }
            >
              <Pencil className="size-2" aria-hidden />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                onClick={acceptMapEdit}
                disabled={pending}
              >
                {pending ? "Saving…" : "Accept"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelMapEdit}
                disabled={pending}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
        {mapError ? (
          <p className="text-sm text-destructive" role="alert">
            {mapError}
          </p>
        ) : null}
        <TrainingPathMap
          items={mapItems}
          itemOrderEdit={
            mapEditing
              ? {
                  orderedItemIds: orderDraft,
                  onOrderChange: setOrderDraft,
                  onRemoveItemId: removePathItemRow,
                }
              : undefined
          }
        />
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          Add Training Content
        </Button>
      </section>
      </DashboardContentFrame>

      <AddTrainingContentModal
        open={addOpen}
        onOpenChange={setAddOpen}
        trainingPathId={path.id}
        catalog={catalog}
        existingKeys={new Set(existingKeys)}
        onAdded={() => router.refresh()}
      />
    </DashboardPageShell>
  );
}

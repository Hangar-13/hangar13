"use client";

import { useState, useTransition } from "react";
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

type Props = {
  path: {
    id: string;
    name: string;
    description: string | null;
    visibility: CatalogVisibility;
    talentLmsCourseId: string | null;
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
  const [pending, startTransition] = useTransition();

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
    <div className="space-y-8">
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
        <div className="border-t pt-4 space-y-1">
          <VisibilitySectionEditor
            entityKind="trainingPath"
            visibility={path.visibility}
            onSave={async (next) =>
              updateTrainingPathFields(path.id, { visibility: next })
            }
            onSaved={() => router.refresh()}
          />
        </div>
        <div className="border-t pt-4 space-y-2">
          <EditableInline
            label="TalentLMS course ID"
            value={path.talentLmsCourseId ?? ""}
            displayClassName="text-sm font-medium font-mono"
            placeholder="e.g. 126 (optional)"
            onSave={async (raw) => {
              const trimmed = raw.trim();
              const r = await updateTrainingPathFields(path.id, {
                talentLmsCourseId: trimmed === "" ? null : trimmed,
              });
              if (r.ok) router.refresh();
              return r;
            }}
          />
          <p className="text-sm text-muted-foreground max-w-2xl">
            When set and{" "}
            <code className="text-xs">TALENTLMS_API_KEY</code> is configured on
            the server, learners are enrolled in this Talent course when they
            self-enroll in this Hangar path. If they do not exist in Talent yet,
            Hangar creates their learner via the Talent API using the same login
            rules as SSO, then enrolls them (
            <a
              href="https://www.talentlms.com/pages/docs/TalentLMS-API-Documentation.pdf"
              className="underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              TalentLMS REST API
            </a>
            ). Use the numeric course ID from Talent (same id as in lesson URLs).
          </p>
        </div>
      </header>

      <section className="space-y-4">
        <div className="group flex flex-wrap items-center gap-1 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Lesson Map</h2>
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

      <AddTrainingContentModal
        open={addOpen}
        onOpenChange={setAddOpen}
        trainingPathId={path.id}
        catalog={catalog}
        existingKeys={new Set(existingKeys)}
        onAdded={() => router.refresh()}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { purchaseTrainingPlan } from "@/app/actions/purchase-training";
import { useAppNavigation } from "@/components/app-navigation-provider";

export type TrainingPathOfferRow = {
  id: string;
  name: string;
  description: string | null;
  /** Sum of lesson hours on the path; may be null before recalculation. */
  total_hours: number | null;
  visibility?: string;
  monetization?: string;
};

type Props = {
  plans: TrainingPathOfferRow[];
  enrolledPlanIds: string[];
};

export function FindTrainingProgramsClient({
  plans,
  enrolledPlanIds,
}: Props) {
  const router = useRouter();
  const { refreshTraineeEnrollment } = useAppNavigation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TrainingPathOfferRow | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrolledSet = new Set(enrolledPlanIds);

  function openConfirm(plan: TrainingPathOfferRow) {
    setError(null);
    setSelectedPlan(plan);
    setConfirmOpen(true);
  }

  async function onConfirmPurchase() {
    if (!selectedPlan) return;
    setBusy(true);
    setError(null);
    const res = await purchaseTrainingPlan(selectedPlan.id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirmOpen(false);
    setSelectedPlan(null);
    await refreshTraineeEnrollment();
    router.refresh();
  }

  if (plans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No training programs are available yet.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border/80">
        {plans.map((plan) => {
          const enrolled = enrolledSet.has(plan.id);
          return (
            <li
              key={plan.id}
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5"
            >
              <div className="min-w-0 space-y-2">
                <h2 className="text-lg font-semibold leading-tight">{plan.name}</h2>
                {plan.description ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {plan.description}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {typeof plan.total_hours === "number"
                    ? `${plan.total_hours} hours`
                    : "—"}
                </p>
              </div>
              <div className="shrink-0 sm:pt-0.5">
                {enrolled ? (
                  <span className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                    Enrolled
                  </span>
                ) : (
                  <Button type="button" onClick={() => openConfirm(plan)}>
                    Purchase
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm purchase</DialogTitle>
            <DialogDescription>
              {selectedPlan ? (
                <>
                  You are about to enroll in{" "}
                  <span className="font-medium text-foreground">
                    {selectedPlan.name}
                  </span>
                  . Payment will be collected in this step in a future update.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={onConfirmPurchase}>
              {busy ? "Working…" : "Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

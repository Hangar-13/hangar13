"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setCurrentCertificationGoal } from "@/app/actions/user-certification-goal";
import type { Certification } from "@/lib/certification";
import {
  CERTIFICATION_GOAL_OPTIONS,
  certificationGoalDescription,
  certificationLabel,
} from "@/lib/certification";

type Props = {
  currentCertification: Certification | null;
  readOnly?: boolean;
  /** Label for the header button (ignored when readOnly). */
  buttonLabel?: string;
};

function isSelectableCert(c: Certification | null): c is Exclude<Certification, "other"> {
  return c === "FAA_A" || c === "FAA_P" || c === "FAA_AP";
}

export function CertificationGoalSelector({ currentCertification, readOnly, buttonLabel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [draftCert, setDraftCert] = useState<Exclude<Certification, "other"> | undefined>(undefined);
  const [applyError, setApplyError] = useState<string | null>(null);

  function openModal() {
    setApplyError(null);
    if (isSelectableCert(currentCertification)) {
      setDraftCert(currentCertification);
    } else {
      setDraftCert(undefined);
    }
    setModalOpen(true);
  }

  function handleCancel() {
    setModalOpen(false);
    setDraftCert(undefined);
    setApplyError(null);
  }

  function handleApply() {
    if (draftCert === undefined) return;
    setApplyError(null);
    startTransition(async () => {
      const result = await setCurrentCertificationGoal(draftCert);
      if (result.error) {
        setApplyError(result.error);
        return;
      }
      setModalOpen(false);
      setDraftCert(undefined);
      router.refresh();
    });
  }

  if (readOnly) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Certification goal</p>
        <p className="font-medium">
          {currentCertification ? certificationLabel(currentCertification) : "No certification selected"}
        </p>
      </div>
    );
  }

  if (!buttonLabel) {
    throw new Error("CertificationGoalSelector: buttonLabel is required when not readOnly");
  }

  const modalDescriptionText =
    draftCert !== undefined ? certificationGoalDescription(draftCert) : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={openModal}
        disabled={isPending}
      >
        {buttonLabel}
      </Button>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Certification Selection</DialogTitle>
            <DialogDescription className="sr-only">
              Choose your FAA certification goal for ACS code tracking.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cert-modal-select">Certification</Label>
              <Select
                value={draftCert}
                onValueChange={(v) => setDraftCert(v as Exclude<Certification, "other">)}
              >
                <SelectTrigger id="cert-modal-select" className="w-full">
                  <SelectValue placeholder="Choose FAA certification…" />
                </SelectTrigger>
                <SelectContent>
                  {CERTIFICATION_GOAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {modalDescriptionText ? (
              <p className="text-sm text-muted-foreground leading-relaxed border rounded-md bg-muted/30 px-3 py-2.5">
                {modalDescriptionText}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Select a certification to see a short description.</p>
            )}
            {applyError ? (
              <p className="text-sm text-destructive" role="alert">
                {applyError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApply} disabled={isPending || draftCert === undefined}>
              {isPending ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useCallback, useState, useTransition } from "react";
import { updateLessonFields } from "@/app/actions/manager-training-content";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AcsInclusionSwitchRow } from "@/components/manager/manager-acs-inclusion-toggle-row";
import { ManagerLessonAcsCodesSection } from "@/components/manager/manager-lesson-acs-section";
import type { AcsCodePickerRow } from "@/components/manager/acs-codes-picker";

type Props = {
  lessonId: string;
  acsCodes: number[];
  catalog: AcsCodePickerRow[];
  onSaved: () => void;
  /** DOM id for the switch (accessibility) */
  switchId: string;
};

/**
 * "Enable ACS Codes" switch between ATA and the ACS block; on the lesson
 * page, requires confirmation before clearing non-empty server-side ACS.
 */
export function LessonAcsCodesInclusionSection({
  lessonId,
  acsCodes,
  catalog,
  onSaved,
  switchId,
}: Props) {
  const [includeAcs, setIncludeAcs] = useState(() => acsCodes.length > 0);
  /** Increments when the user turns "Enable ACS Codes" on (off → on) so the ACS block opens in edit mode. */
  const [openAcsInEditToken, setOpenAcsInEditToken] = useState(0);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [pendingClear, startClearTransition] = useTransition();

  const hasSavedCodes = acsCodes.length > 0;

  const onIncludeChange = useCallback(
    (next: boolean) => {
      if (next) {
        setIncludeAcs((wasIncluded) => {
          if (!wasIncluded) {
            setOpenAcsInEditToken((t) => t + 1);
          }
          return true;
        });
        return;
      }
      if (hasSavedCodes) {
        setConfirmClearOpen(true);
        return;
      }
      setIncludeAcs(false);
    },
    [hasSavedCodes]
  );

  function confirmRemoveAcs() {
    startClearTransition(async () => {
      const r = await updateLessonFields(lessonId, { acs_codes: [] });
      if (r.ok) {
        setConfirmClearOpen(false);
        setIncludeAcs(false);
        onSaved();
      }
    });
  }

  return (
    <div className="space-y-2">
      <AcsInclusionSwitchRow
        id={switchId}
        include={includeAcs}
        onChange={onIncludeChange}
        disabled={pendingClear}
      />

      {includeAcs ? (
        <ManagerLessonAcsCodesSection
          lessonId={lessonId}
          acsCodes={acsCodes}
          catalog={catalog}
          onSaved={onSaved}
          onClearedAcsInDb={() => setIncludeAcs(false)}
          openInEditModeToken={openAcsInEditToken}
        />
      ) : null}

      <Dialog
        open={confirmClearOpen}
        onOpenChange={(o) => {
          if (!o && !pendingClear) setConfirmClearOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove ACS codes?</DialogTitle>
            <DialogDescription>
              All assigned ACS codes for this lesson will be lost. You can add
              codes again later if you need to.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmClearOpen(false)}
              disabled={pendingClear}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmRemoveAcs}
              disabled={pendingClear}
            >
              {pendingClear ? "Removing…" : "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { MailingListForm } from "@/components/marketing/mailing-list-form";
import type { MailingListAudience } from "@/lib/marketing/mailing-list";

export function MailingListModal({
  open,
  onOpenChange,
  defaultAudience = "mechanic",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAudience?: MailingListAudience | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[80] bg-[#121417]/70" />
        <DialogPrimitive.Content
          className="z-[81] flex max-h-[min(92svh,42rem)] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden border border-[#121417] bg-[#F4F7F9] text-[#121417] shadow-2xl outline-none"
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogTitle className="sr-only">Join the mailing list</DialogTitle>
          <DialogDescription className="sr-only">
            Enter your name and email to join the Hangar13 mailing list.
          </DialogDescription>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
            {open ? (
              <MailingListForm
                defaultAudience={defaultAudience}
                onBack={() => onOpenChange(false)}
              />
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

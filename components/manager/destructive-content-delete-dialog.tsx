"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type DeleteLine = { kind: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  lines: DeleteLine[];
  onConfirm: () => void;
  confirmLabel?: string;
  pending?: boolean;
};

export function DestructiveContentDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  lines,
  onConfirm,
  confirmLabel = "Delete",
  pending = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {lines.length > 0 ? (
          <ul className="text-sm border rounded-md divide-y max-h-48 overflow-y-auto">
            {lines.map((line, i) => (
              <li key={i} className="px-3 py-2">
                <span className="text-muted-foreground text-xs uppercase tracking-wide mr-2">
                  {line.kind}
                </span>
                <span className="font-medium">{line.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

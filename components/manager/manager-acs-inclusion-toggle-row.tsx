"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = {
  id: string;
  include: boolean;
  onChange: (include: boolean) => void;
  disabled?: boolean;
};

/** Shared ACS enable label + switch (label text is fixed; on/off is the switch only). */
export function AcsInclusionSwitchRow({ id, include, onChange, disabled }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Switch
        id={id}
        checked={include}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0"
      />
      <Label
        htmlFor={id}
        className="text-sm font-medium text-foreground leading-snug cursor-pointer"
      >
        Enable ACS Codes
      </Label>
    </div>
  );
}

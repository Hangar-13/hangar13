"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveOrganizationId } from "@/app/actions/active-organization";
import type { OrganizationRole } from "@/lib/auth-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OrgSwitcherMembership = {
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
};

export function OrganizationSwitcher({
  memberships,
  activeOrganizationId,
  onChanged,
}: {
  memberships: OrgSwitcherMembership[];
  activeOrganizationId: string | null;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    return null;
  }

  async function handleChange(orgId: string) {
    startTransition(async () => {
      const res = await setActiveOrganizationId(orgId);
      if (res.ok) {
        onChanged?.();
        router.refresh();
      }
    });
  }

  const value = activeOrganizationId ?? memberships[0]?.organizationId ?? "";

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Building2 className="h-4 w-4 text-muted-foreground hidden sm:block" aria-hidden />
      <Select
        value={value}
        onValueChange={(v) => void handleChange(v)}
        disabled={pending}
      >
        <SelectTrigger className="h-9 w-[min(100vw-8rem,220px)] sm:w-[220px]">
          <SelectValue placeholder="Organization" />
        </SelectTrigger>
        <SelectContent>
          {memberships.map((m) => (
            <SelectItem key={m.organizationId} value={m.organizationId}>
              {m.organizationName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  orgCreateEntitlementForPath,
  orgUpdateEntitlement,
} from "@/app/actions/org-dashboard";
import type { OrgEntitlementRow } from "@/lib/org-dashboard-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

function EntitlementRowForm({
  row,
  pending,
  startTransition,
  setError,
}: {
  row: OrgEntitlementRow;
  pending: boolean;
  startTransition: (fn: () => void) => void;
  setError: (s: string | null) => void;
}) {
  const router = useRouter();
  const [licenses, setLicenses] = useState(String(row.licensesPurchased));
  const [expires, setExpires] = useState(formatDate(row.expiresAt));

  function save() {
    setError(null);
    startTransition(async () => {
      const licensesPurchased = Number.parseInt(licenses, 10);
      if (Number.isNaN(licensesPurchased) || licensesPurchased < 0) {
        setError("Licenses must be a non-negative integer.");
        return;
      }
      const expiresAt = expires.trim() === "" ? null : expires.trim();

      if (row.id) {
        const res = await orgUpdateEntitlement({
          entitlementId: row.id,
          licensesPurchased,
          expiresAt,
        });
        if (!res.ok) setError(res.error);
        else router.refresh();
      } else if (row.trainingPathId) {
        const res = await orgCreateEntitlementForPath({
          trainingPathId: row.trainingPathId,
          licensesPurchased,
          expiresAt,
        });
        if (!res.ok) setError(res.error);
        else router.refresh();
      }
    });
  }

  return (
    <tr className="border-b last:border-0">
      <td className="p-3 font-medium">{row.trainingPathName}</td>
      <td className="p-3">
        <Input
          className="h-9 w-24 tabular-nums"
          value={licenses}
          onChange={(e) => setLicenses(e.target.value)}
          disabled={pending}
        />
      </td>
      <td className="p-3">
        <Input
          type="date"
          className="h-9 w-[160px]"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          disabled={pending}
        />
      </td>
      <td className="p-3">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </td>
    </tr>
  );
}

export function OrgSubscriptionsPanel({
  rows,
}: {
  rows: OrgEntitlementRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Training path</th>
              <th className="p-3 font-medium">Licenses</th>
              <th className="p-3 font-medium">Expiration</th>
              <th className="p-3 font-medium w-[120px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <EntitlementRowForm
                key={row.trainingPathId ?? row.trainingPathName}
                row={row}
                pending={pending}
                startTransition={startTransition}
                setError={setError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

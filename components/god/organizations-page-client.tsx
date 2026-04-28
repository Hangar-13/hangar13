"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { CreateOrganizationDialog } from "@/components/god/create-organization-dialog";
import { Button } from "@/components/ui/button";
import type { GodOrganizationListRow } from "@/app/actions/god-organizations";

type OrganizationsPageClientProps = {
  initialOrgs: GodOrganizationListRow[];
};

export function OrganizationsPageClient({ initialOrgs }: OrganizationsPageClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const orgs = initialOrgs;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <Button onClick={() => setCreateOpen(true)} className="w-fit gap-1.5" type="button">
          <Plus className="h-4 w-4" />
          Add New Org
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[400px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">People</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr>
                <td colSpan={2} className="p-4 text-center text-muted-foreground">
                  No organizations yet. Create one to get started.
                </td>
              </tr>
            ) : (
              orgs.map((o) => (
                <tr
                  key={o.id}
                  className="border-b last:border-0 transition-colors hover:bg-muted/30 cursor-pointer"
                >
                  <td className="p-0">
                    <Link
                      href={`/dashboard/god/organizations/${o.id}`}
                      className="block p-3 font-medium text-foreground"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/dashboard/god/organizations/${o.id}`}
                      className="block p-3 text-muted-foreground"
                    >
                      {o.memberCount}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

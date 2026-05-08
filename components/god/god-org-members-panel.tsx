"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { godUpdateOrganizationMemberRole } from "@/app/actions/god-organizations";
import type { GodOrganizationDetail } from "@/app/actions/god-organizations";
import type { OrganizationRole } from "@/lib/auth-shared";
import { GOD_UI_ORG_ROLES } from "@/lib/god-user-constants";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roleLabels: Record<string, string> = {
  student: "Student",
  mentor: "Mentor",
  manager: "Manager",
  supervisor: "Supervisor",
  lead: "Lead",
};

type Member = GodOrganizationDetail["members"][number];

export function GodOrgMembersPanel({
  organizationId,
  members,
}: {
  organizationId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function commitRole(userId: string, next: OrganizationRole) {
    setMessage(null);
    startTransition(async () => {
      const res = await godUpdateOrganizationMemberRole(organizationId, userId, next);
      if (res.ok) {
        setEditingUserId(null);
        router.refresh();
      } else {
        setMessage(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-4 text-center text-muted-foreground">
                  No members.
                </td>
              </tr>
            ) : (
              members.map((m) => {
                const editing = editingUserId === m.userId;
                return (
                  <tr key={m.userId} className="border-b last:border-0">
                    <td className="p-3">
                      <span>{m.fullName || "—"}</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{m.email || "—"}</td>
                    <td className="p-3">
                      {editing ? (
                        <span className="inline-flex items-center gap-1">
                          <Select
                            value={m.orgRole}
                            onValueChange={(v) => {
                              const next = v as OrganizationRole;
                              if (next === m.orgRole) {
                                setEditingUserId(null);
                                return;
                              }
                              commitRole(m.userId, next);
                            }}
                            disabled={pending}
                          >
                            <SelectTrigger className="w-[160px] h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GOD_UI_ORG_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {roleLabels[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            title="Cancel"
                            disabled={pending}
                            onClick={() => setEditingUserId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </span>
                      ) : (
                        <span className="group inline-flex items-center gap-1">
                          <span className="capitalize text-muted-foreground">
                            {roleLabels[m.orgRole] ?? m.orgRole}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
                            title="Edit role"
                            disabled={pending}
                            onClick={() => setEditingUserId(m.userId)}
                          >
                            <Pencil className="size-2" aria-hidden />
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

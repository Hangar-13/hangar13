"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { godUpdateUserSystemRole, type GodUserDetail } from "@/app/actions/god-users";
import { LeadBadge } from "@/components/god/lead-badge";
import { GOD_UI_SYSTEM_ROLES } from "@/lib/god-user-constants";
import type { SystemRole } from "@/lib/auth-shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const systemRoleLabel: Record<SystemRole, string> = {
  guest: "Guest",
  student: "Student",
  mentor: "Mentor",
  manager: "Manager",
  admin: "Admin",
  god: "God",
};

const orgRoleLabel: Record<string, string> = {
  student: "Student",
  mentor: "Mentor",
  manager: "Manager",
  admin: "Admin",
};

type GodUserDetailClientProps = {
  user: GodUserDetail;
};

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function GodUserDetailClient({ user: initial }: GodUserDetailClientProps) {
  const id = useId();
  const router = useRouter();
  const [user, setUser] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState<SystemRole>(initial.role as SystemRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const beginEdit = () => {
    setError(null);
    setRoleDraft(user.role as SystemRole);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const saveRole = () => {
    setError(null);
    startTransition(() => {
      void (async () => {
        const res = await godUpdateUserSystemRole(user.id, roleDraft);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setUser((u) => ({ ...u, role: roleDraft }));
        setEditing(false);
        router.refresh();
      })();
    });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3 text-sm max-w-2xl">
        <p>
          <span className="text-muted-foreground">Name </span>
          <span className="font-medium">{user.fullName?.trim() || "—"}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Email </span>
          <span className="font-medium">{user.email || "—"}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2 min-h-9">
          <span className="text-muted-foreground">Role</span>
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={roleDraft} onValueChange={(v) => setRoleDraft(v as SystemRole)}>
                <SelectTrigger className="w-[200px]" id={`${id}-role`} size="default">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOD_UI_SYSTEM_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {systemRoleLabel[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="default"
                className="h-8 w-8"
                onClick={saveRole}
                disabled={isPending}
                aria-label="Save role"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-8 w-8"
                onClick={cancelEdit}
                disabled={isPending}
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5">
              <span className="font-medium capitalize">{user.role}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={beginEdit}
                aria-label="Edit system role"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Joined </span>
          <span className="font-medium">{formatDate(user.createdAt)}</span>
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Organizations</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Organization</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Date Joined</th>
              </tr>
            </thead>
            <tbody>
              {user.organizations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-muted-foreground">
                    No organization memberships.
                  </td>
                </tr>
              ) : (
                user.organizations.map((o) => (
                  <tr key={o.organizationId} className="border-b last:border-0">
                    <td className="p-3 font-medium">{o.name}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        <span className="capitalize">{orgRoleLabel[o.role] ?? o.role}</span>
                        {o.isLead && <LeadBadge />}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground tabular-nums">
                      {formatDate(o.dateJoined)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Training</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Date Enrolled</th>
                <th className="p-3 font-medium">Enrolled By</th>
                <th className="p-3 font-medium">Date Completed</th>
              </tr>
            </thead>
            <tbody>
              {user.trainings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-muted-foreground">
                    No training enrollments.
                  </td>
                </tr>
              ) : (
                user.trainings.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3 text-muted-foreground">{t.statusLabel}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(t.dateEnrolled)}</td>
                    <td className="p-3 text-muted-foreground">{t.enrolledBy}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(t.dateCompleted)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import {
  godForceCreateTalentLmsUser,
  godUpdateUserSystemRole,
  type GodUserDetail,
} from "@/app/actions/god-users";
import { LeadBadge } from "@/components/god/lead-badge";
import { GOD_UI_SYSTEM_ROLES } from "@/lib/god-user-constants";
import { normalizeSystemRole, type SystemRole } from "@/lib/auth-shared";
import { formatUiDate } from "@/lib/format-ui-date";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSectionLabel, DashboardTableShell } from "@/components/dashboard/page-shell";

const systemRoleLabel: Record<SystemRole, string> = {
  guest: "Guest",
  standard: "Standard",
  admin: "Admin",
  god: "God",
};

const orgRoleLabel: Record<string, string> = {
  student: "Student",
  mentor: "Mentor",
  manager: "Manager",
  supervisor: "Supervisor",
};

type GodUserDetailClientProps = {
  user: GodUserDetail;
  viewerUserId: string;
  viewerRole: SystemRole;
};

export function GodUserDetailClient({
  user: initial,
  viewerUserId,
  viewerRole,
}: GodUserDetailClientProps) {
  const id = useId();
  const router = useRouter();
  const [user, setUser] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState<SystemRole>(initial.role as SystemRole);
  const [error, setError] = useState<string | null>(null);
  const [talentError, setTalentError] = useState<string | null>(null);
  const [talentNotice, setTalentNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [talentPending, startTalentTransition] = useTransition();

  const beginEdit = () => {
    setError(null);
    setRoleDraft(user.role as SystemRole);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const targetRoleNorm = normalizeSystemRole(user.role) as SystemRole;
  const canEditSystemRole =
    viewerRole === "god" ||
    (viewerRole === "admin" &&
      viewerUserId !== user.id &&
      targetRoleNorm !== "god");

  const talentProvisionStatusLabel = (status: string | null) => {
    if (status === "provisioned") return "Created";
    if (status === "failed") return "Failed";
    if (status === "pending") return "Not created";
    return "Unknown";
  };

  const createTalentUser = () => {
    setTalentError(null);
    setTalentNotice(null);
    startTalentTransition(() => {
      void (async () => {
        const res = await godForceCreateTalentLmsUser(user.id);
        if (!res.ok) {
          setTalentError(res.error);
          return;
        }
        setUser((u) => ({
          ...u,
          talentLmsProvisionStatus: "provisioned",
          talentLmsProvisionLastError: null,
          talentLmsProvisionedAt: new Date().toISOString(),
        }));
        const enrollBit =
          res.enrolledCourseCount > 0
            ? ` Enrolled in ${res.enrolledCourseCount} Talent course${
                res.enrolledCourseCount === 1 ? "" : "s"
              }.`
            : " No mapped Talent courses on their Hangar enrollments yet.";
        setTalentNotice(
          res.enrollWarning
            ? `Created the Talent LMS user.${enrollBit} Enrollment warning: ${res.enrollWarning}`
            : `Created the Talent LMS user.${enrollBit}`
        );
        router.refresh();
      })();
    });
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
            <div
              className={
                canEditSystemRole
                  ? "group inline-flex items-center gap-1"
                  : "inline-flex items-center gap-1"
              }
            >
              <span className="font-medium">
                {systemRoleLabel[targetRoleNorm] ?? user.role}
              </span>
              {canEditSystemRole ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-5 w-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
                  onClick={beginEdit}
                  aria-label="Edit system role"
                >
                  <Pencil className="size-2" aria-hidden />
                </Button>
              ) : null}
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
          <span className="font-medium">{formatUiDate(user.createdAt)}</span>
        </p>
      </div>

      <section className="space-y-3 max-w-2xl">
        <DashboardSectionLabel>Talent LMS</DashboardSectionLabel>
        <div className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Account </span>
            <span className="font-medium">
              {talentProvisionStatusLabel(user.talentLmsProvisionStatus)}
            </span>
          </p>
          {user.talentLmsProvisionedAt ? (
            <p>
              <span className="text-muted-foreground">Last created </span>
              <span className="font-medium">
                {formatUiDate(user.talentLmsProvisionedAt)}
              </span>
            </p>
          ) : null}
          {user.talentLmsProvisionStatus === "failed" &&
          user.talentLmsProvisionLastError ? (
            <p className="text-destructive" role="status">
              {user.talentLmsProvisionLastError}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            Creates the Talent LMS learner for this Hangar email if they are
            missing, then enrolls them in Talent courses mapped from their
            Hangar training.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={talentPending || !user.email}
            onClick={createTalentUser}
          >
            {talentPending ? "Creating…" : "Create Talent LMS user"}
          </Button>
          {!user.email ? (
            <p className="text-destructive text-sm" role="alert">
              This Hangar user has no email, so Talent LMS cannot create them.
            </p>
          ) : null}
          {talentError ? (
            <p className="text-destructive text-sm" role="alert">
              {talentError}
            </p>
          ) : null}
          {talentNotice ? (
            <p className="text-sm" role="status">
              {talentNotice}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <DashboardSectionLabel>Organizations</DashboardSectionLabel>
        <DashboardTableShell>
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
                      {formatUiDate(o.dateJoined)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DashboardTableShell>
      </section>

      <section className="space-y-3">
        <DashboardSectionLabel>Training</DashboardSectionLabel>
        <DashboardTableShell>
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
                    <td className="p-3 text-muted-foreground">{formatUiDate(t.dateEnrolled)}</td>
                    <td className="p-3 text-muted-foreground">{t.enrolledBy}</td>
                    <td className="p-3 text-muted-foreground">{formatUiDate(t.dateCompleted)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DashboardTableShell>
      </section>
    </div>
  );
}

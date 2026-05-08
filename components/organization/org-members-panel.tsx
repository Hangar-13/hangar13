"use client";

/**
 * Organization members table + multi-row invites. User search / “New” email checks call
 * server actions that depend on DB migration `069_org_supervisor_directory_invite_search.sql`
 * — apply migrations (`npx supabase db push` or your usual workflow) or those flows 500.
 * Invite/link batch actions also need `070_org_invite_resolve_user_rpc.sql` (session RPCs; linking
 * existing users does not require `SUPABASE_SERVICE_ROLE_KEY`; brand-new email invites still do).
 */

import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2, Pencil, Plus, UserPlus, X } from "lucide-react";
import {
  orgDirectoryEmailAvailableForInvite,
  orgInviteMembers,
  orgRemoveMember,
  orgSearchDirectoryUsersForInvite,
  orgUpdateMemberRole,
} from "@/app/actions/org-dashboard";
import type { DirectoryInviteSearchHit } from "@/app/actions/org-dashboard";
import {
  godDirectoryEmailAvailableForInvite,
  godInviteMembersToOrganization,
  godRemoveOrganizationMember,
  godSearchDirectoryUsersForInvite,
  godUpdateOrganizationMemberRole,
} from "@/app/actions/god-organizations";
import type { OrgMemberRow } from "@/lib/org-dashboard-data";
import type { OrganizationRole } from "@/lib/auth-shared";
import { GOD_UI_ORG_ROLES } from "@/lib/god-user-constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const supervisorInviteRoles: OrganizationRole[] = ["student", "mentor", "manager"];

const roleLabels: Record<string, string> = {
  student: "Student",
  mentor: "Mentor",
  manager: "Manager",
  supervisor: "Supervisor",
  lead: "Lead",
};

const newBadgeClassName =
  "shrink-0 inline-flex items-center rounded-md border border-sky-600/20 bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-100";

export type OrgMembersPanelMember = {
  userId: string;
  email: string | null;
  fullName: string | null;
  orgRole: string;
};

type DraftRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: OrganizationRole;
  linkedUserId: string | null;
};

function splitDisplayName(full: string | null | undefined): { first: string; last: string } {
  const s = (full || "").trim();
  if (!s) return { first: "—", last: "—" };
  const i = s.indexOf(" ");
  if (i === -1) return { first: s, last: "—" };
  const last = s.slice(i + 1).trim();
  return { first: s.slice(0, i), last: last || "—" };
}

function splitInviteFullName(full: string | null | undefined): { first: string; last: string } {
  const s = (full || "").trim();
  if (!s) return { first: "", last: "" };
  const i = s.indexOf(" ");
  if (i === -1) return { first: s, last: "" };
  return { first: s.slice(0, i), last: s.slice(i + 1).trim() };
}

function newDraftRow(defaultRole: OrganizationRole): DraftRow {
  return {
    id: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    email: "",
    role: defaultRole,
    linkedUserId: null,
  };
}

function isValidEmail(value: string): boolean {
  const t = value.trim();
  return t.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function draftSearchQuery(row: DraftRow): string {
  return [row.firstName, row.lastName, row.email]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function draftRowsAreAllValid(
  rows: DraftRow[],
  emailAvailable: Record<string, boolean | null>
): boolean {
  if (rows.length === 0) return false;
  const emailsLower = rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
  if (new Set(emailsLower).size !== emailsLower.length) return false;
  return rows.every((r) => {
    if (!r.firstName.trim() || !r.lastName.trim() || !isValidEmail(r.email)) {
      return false;
    }
    if (r.linkedUserId) return true;
    return emailAvailable[r.id] === true;
  });
}

type OrgMembersPanelProps = {
  members: OrgMemberRow[] | OrgMembersPanelMember[];
  mode: "supervisor" | "god";
  /** Required when mode is `god` (invite + role updates target this org). */
  organizationId?: string;
};

function MemberInviteDraftRow({
  row,
  mode,
  organizationId,
  pending,
  inviteRoles,
  emailAvailable,
  onPatch,
  onRemove,
  onAvailabilityChange,
  onActivateInviteSearch,
}: {
  row: DraftRow;
  mode: "supervisor" | "god";
  organizationId?: string;
  pending: boolean;
  inviteRoles: OrganizationRole[];
  emailAvailable: boolean | null;
  onPatch: (id: string, patch: Partial<DraftRow>) => void;
  onRemove: (id: string) => void;
  onAvailabilityChange: (rowId: string, available: boolean | null) => void;
  onActivateInviteSearch: (rowId: string) => void;
}) {
  const locked = row.linkedUserId != null;
  const debouncedEmailTrimmed = useDebounced(row.email.trim(), 400);

  useEffect(() => {
    if (locked) {
      onAvailabilityChange(row.id, null);
      return;
    }
    if (!isValidEmail(debouncedEmailTrimmed)) {
      onAvailabilityChange(row.id, null);
      return;
    }

    let cancelled = false;
    (async () => {
      const res =
        mode === "god"
          ? await godDirectoryEmailAvailableForInvite(
              organizationId!,
              debouncedEmailTrimmed
            )
          : await orgDirectoryEmailAvailableForInvite(debouncedEmailTrimmed);

      if (cancelled) return;
      if (!res.ok) {
        onAvailabilityChange(row.id, false);
        return;
      }
      onAvailabilityChange(row.id, res.available);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    debouncedEmailTrimmed,
    locked,
    mode,
    organizationId,
    row.id,
    onAvailabilityChange,
  ]);

  const inputClass =
    "h-9 border-border bg-white text-foreground shadow-sm dark:bg-white dark:text-neutral-950";

  const showNewBadge =
    !locked && isValidEmail(row.email) && emailAvailable === true;

  const showEmailConflict =
    !locked && isValidEmail(row.email) && emailAvailable === false;

  return (
    <tr className="border-b border-border/80 align-top last:border-0">
      <td className="p-3">
        <div className="space-y-1">
          <Input
            value={row.firstName}
            onChange={(e) => {
              onActivateInviteSearch(row.id);
              onPatch(row.id, { firstName: e.target.value, linkedUserId: null });
            }}
            onFocus={() => onActivateInviteSearch(row.id)}
            placeholder="First name"
            autoComplete="off"
            disabled={pending || locked}
            className={cn(inputClass, "min-w-[120px]")}
          />
          {locked ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs text-muted-foreground"
              disabled={pending}
              onClick={() => onPatch(row.id, { linkedUserId: null })}
            >
              Change person
            </Button>
          ) : null}
        </div>
      </td>
      <td className="p-3">
        <Input
          value={row.lastName}
          onChange={(e) => {
            onActivateInviteSearch(row.id);
            onPatch(row.id, { lastName: e.target.value, linkedUserId: null });
          }}
          onFocus={() => onActivateInviteSearch(row.id)}
          placeholder="Last name"
          autoComplete="off"
          disabled={pending || locked}
          className={cn(inputClass, "min-w-[120px]")}
        />
      </td>
      <td className="p-3">
        <div className="min-w-[200px] space-y-1">
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={row.email}
              onChange={(e) => {
                onActivateInviteSearch(row.id);
                onPatch(row.id, { email: e.target.value, linkedUserId: null });
              }}
              onFocus={() => onActivateInviteSearch(row.id)}
              placeholder="Email"
              autoComplete="off"
              disabled={pending || locked}
              className={cn(inputClass, "min-w-0 flex-1")}
            />
            {showNewBadge ? <span className={newBadgeClassName}>New</span> : null}
          </div>
          {showEmailConflict ? (
            <p className="text-xs text-destructive">This email is already registered.</p>
          ) : null}
        </div>
      </td>
      <td className="p-3 align-middle">
        <Select
          value={row.role}
          onValueChange={(v) => onPatch(row.id, { role: v as OrganizationRole })}
          disabled={pending}
        >
          <SelectTrigger className="h-9 w-[140px] border-border bg-white text-foreground shadow-sm dark:bg-white dark:text-neutral-950">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {inviteRoles.map((r) => (
              <SelectItem key={r} value={r}>
                {roleLabels[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-3 align-middle text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Remove row"
          disabled={pending}
          onClick={() => onRemove(row.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

export function OrgMembersPanel({ members, mode, organizationId }: OrgMembersPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    label: string;
  } | null>(null);

  const inviteRoles = useMemo(
    () => (mode === "god" ? [...GOD_UI_ORG_ROLES] : supervisorInviteRoles),
    [mode]
  );

  const defaultInviteRole = inviteRoles[0] ?? "student";

  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [emailAvailableByRow, setEmailAvailableByRow] = useState<
    Record<string, boolean | null>
  >({});

  const [inviteSearchActiveRowId, setInviteSearchActiveRowId] = useState<string | null>(
    null
  );
  const [inviteSearchHits, setInviteSearchHits] = useState<DirectoryInviteSearchHit[]>([]);
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false);
  const inviteSearchReq = useRef(0);

  const setAvailabilityForRow = useCallback((rowId: string, available: boolean | null) => {
    setEmailAvailableByRow((m) => {
      if (m[rowId] === available) return m;
      return { ...m, [rowId]: available };
    });
  }, []);

  const memberUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members]
  );

  const inviteSearchActiveRow = useMemo(
    () => draftRows.find((r) => r.id === inviteSearchActiveRowId) ?? null,
    [draftRows, inviteSearchActiveRowId]
  );

  const inviteSearchLiveKey = inviteSearchActiveRow
    ? draftSearchQuery(inviteSearchActiveRow)
    : "";
  const debouncedInviteSearchKey = useDebounced(inviteSearchLiveKey, 300);

  const inviteSearchOtherLinkedIds = useMemo(() => {
    if (!inviteSearchActiveRowId) {
      return new Set<string>();
    }
    return new Set(
      draftRows
        .filter((r) => r.id !== inviteSearchActiveRowId && r.linkedUserId)
        .map((r) => r.linkedUserId as string)
    );
  }, [draftRows, inviteSearchActiveRowId]);

  const inviteSearchEmailConflict =
    inviteSearchActiveRow != null &&
    inviteSearchActiveRow.linkedUserId == null &&
    isValidEmail(inviteSearchActiveRow.email) &&
    emailAvailableByRow[inviteSearchActiveRow.id] === false;

  useEffect(() => {
    if (!inviteSearchActiveRow || inviteSearchActiveRow.linkedUserId) {
      setInviteSearchHits([]);
      setInviteSearchLoading(false);
      return;
    }

    if (inviteSearchEmailConflict) {
      setInviteSearchHits([]);
      setInviteSearchLoading(false);
      return;
    }

    const q = debouncedInviteSearchKey.trim();
    if (q.length < 2) {
      setInviteSearchHits([]);
      setInviteSearchLoading(false);
      return;
    }

    const id = ++inviteSearchReq.current;
    setInviteSearchLoading(true);

    (async () => {
      const res =
        mode === "god"
          ? await godSearchDirectoryUsersForInvite(organizationId!, q)
          : await orgSearchDirectoryUsersForInvite(q);

      if (inviteSearchReq.current !== id) return;

      setInviteSearchLoading(false);
      if (!res.ok) {
        setInviteSearchHits([]);
        return;
      }

      const filtered = res.users.filter((h) => {
        if (memberUserIds.has(h.id)) return false;
        if (inviteSearchOtherLinkedIds.has(h.id)) return false;
        return true;
      });
      setInviteSearchHits(filtered);
    })();
  }, [
    debouncedInviteSearchKey,
    inviteSearchActiveRow,
    inviteSearchEmailConflict,
    inviteSearchOtherLinkedIds,
    memberUserIds,
    mode,
    organizationId,
  ]);

  const showInviteSearchPanel =
    inviteSearchActiveRow != null &&
    inviteSearchActiveRow.linkedUserId == null &&
    !inviteSearchEmailConflict &&
    debouncedInviteSearchKey.trim().length >= 2;

  const onActivateInviteSearch = useCallback((rowId: string) => {
    setInviteSearchActiveRowId(rowId);
  }, []);

  const pickInviteSearchHit = useCallback(
    (hit: DirectoryInviteSearchHit) => {
      const rowId = inviteSearchActiveRowId;
      if (!rowId) return;
      const { first, last } = splitInviteFullName(hit.full_name);
      const firstName =
        (first || "").trim() || (hit.email.split("@")[0] ?? "").trim() || "User";
      const lastName = (last || "").trim() || firstName;
      setDraftRows((rows) =>
        rows.map((r) =>
          r.id === rowId
            ? {
                ...r,
                linkedUserId: hit.id,
                email: hit.email,
                firstName,
                lastName,
              }
            : r
        )
      );
      setInviteSearchHits([]);
      setInviteSearchLoading(false);
    },
    [inviteSearchActiveRowId]
  );

  const clearDrafts = useCallback(() => {
    setDraftRows([]);
    setEmailAvailableByRow({});
    setInviteSearchActiveRowId(null);
    setInviteSearchHits([]);
    setInviteSearchLoading(false);
    setMessage(null);
  }, []);

  const addDraftRow = useCallback(() => {
    setMessage(null);
    const n = newDraftRow(defaultInviteRole);
    setDraftRows((rows) => [...rows, n]);
    setInviteSearchActiveRowId(n.id);
  }, [defaultInviteRole]);

  function updateDraft(id: string, patch: Partial<DraftRow>) {
    setDraftRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (patch.linkedUserId === null || patch.firstName || patch.lastName || patch.email) {
      setInviteSearchActiveRowId(id);
    }
  }

  function removeDraft(id: string) {
    setDraftRows((rows) => rows.filter((r) => r.id !== id));
    setEmailAvailableByRow((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    if (inviteSearchActiveRowId === id) {
      setInviteSearchActiveRowId(null);
      setInviteSearchHits([]);
      setInviteSearchLoading(false);
    }
  }

  function commitRole(userId: string, next: OrganizationRole) {
    setMessage(null);
    startTransition(async () => {
      if (mode === "god") {
        if (!organizationId) {
          setMessage("Missing organization.");
          return;
        }
        const res = await godUpdateOrganizationMemberRole(organizationId, userId, next);
        if (res.ok) {
          setEditingUserId(null);
          router.refresh();
        } else {
          setMessage(res.error);
        }
      } else {
        const res = await orgUpdateMemberRole(userId, next);
        if (res.ok) {
          setEditingUserId(null);
          router.refresh();
        } else {
          setMessage(res.error);
        }
      }
    });
  }

  function openRemoveMemberDialog(member: { userId: string; fullName: string | null; email: string | null }) {
    const label =
      (member.fullName && member.fullName.trim()) || member.email?.trim() || "this member";
    setRemoveTarget({ userId: member.userId, label });
  }

  function confirmRemoveMember() {
    if (!removeTarget) return;
    if (mode === "god" && !organizationId) {
      setMessage("Missing organization.");
      setRemoveTarget(null);
      return;
    }
    const target = removeTarget;
    setMessage(null);
    startTransition(async () => {
      const res =
        mode === "god"
          ? await godRemoveOrganizationMember(organizationId!, target.userId)
          : await orgRemoveMember(target.userId);
      setRemoveTarget(null);
      if (res.ok) {
        router.refresh();
      } else {
        setMessage(res.error);
      }
    });
  }

  const allDraftsValid = useMemo(
    () => draftRowsAreAllValid(draftRows, emailAvailableByRow),
    [draftRows, emailAvailableByRow]
  );

  function submitDrafts() {
    setMessage(null);
    if (draftRows.length === 0) {
      setMessage("Add at least one row with user details.");
      return;
    }

    const emailsLower = draftRows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
    if (new Set(emailsLower).size !== emailsLower.length) {
      setMessage("Each invite row must use a different email.");
      return;
    }

    if (!draftRowsAreAllValid(draftRows, emailAvailableByRow)) {
      setMessage(
        "Complete every row: first and last name, a valid email, and for new accounts an email that is not already registered—or pick an existing user from the list."
      );
      return;
    }

    const payload = draftRows.map((r) => ({
      email: r.email.trim(),
      firstName: r.firstName.trim(),
      lastName: r.lastName.trim(),
      role: r.role,
      linkedUserId: r.linkedUserId,
    }));

    startTransition(async () => {
      if (mode === "god") {
        if (!organizationId) {
          setMessage("Missing organization.");
          return;
        }
        const res = await godInviteMembersToOrganization(organizationId, payload);
        if (res.ok) {
          clearDrafts();
          router.refresh();
        } else {
          const rowHint = res.failedRow != null ? ` (row ${res.failedRow})` : "";
          setMessage(`${res.error}${rowHint}`);
        }
      } else {
        const res = await orgInviteMembers({ users: payload });
        if (res.ok) {
          clearDrafts();
          router.refresh();
        } else {
          const rowHint = res.failedRow != null ? ` (row ${res.failedRow})` : "";
          setMessage(`${res.error}${rowHint}`);
        }
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Members</h2>
      </div>

      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}

      <div className="space-y-3">
        <div
          className={cn(
            "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
            showInviteSearchPanel ? "overflow-visible" : "overflow-x-auto"
          )}
        >
          <table className="relative z-0 w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="p-3 font-medium">First name</th>
                <th className="p-3 font-medium">Last name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 w-[52px] font-medium text-right" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && draftRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No members yet. Use <span className="font-medium">Add Row</span> below to invite or
                    link users.
                  </td>
                </tr>
              ) : null}
              {members.map((m) => {
                const { first, last } = splitDisplayName(m.fullName);
                const locked =
                  mode === "supervisor" &&
                  (m.orgRole === "supervisor" || m.orgRole === "lead");
                const editing = !locked && editingUserId === m.userId;
                return (
                  <tr key={m.userId} className="border-b border-border/80 last:border-0">
                    <td className="p-3 align-middle">
                      <span className="inline-flex items-center gap-2 flex-wrap">{first}</span>
                    </td>
                    <td className="p-3 align-middle text-muted-foreground">{last}</td>
                    <td className="p-3 align-middle text-muted-foreground">{m.email || "—"}</td>
                    <td className="p-3 align-middle">
                      {locked ? (
                        <span className="text-muted-foreground">
                          {roleLabels[m.orgRole] ?? m.orgRole}
                        </span>
                      ) : editing ? (
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
                            <SelectTrigger className="w-[140px] h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(mode === "god" ? GOD_UI_ORG_ROLES : supervisorInviteRoles).map(
                                (r) => (
                                  <SelectItem key={r} value={r}>
                                    {roleLabels[r]}
                                  </SelectItem>
                                )
                              )}
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
                          <span className="text-muted-foreground">
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
                    <td className="p-3 align-middle text-right">
                      {(mode === "god" || !locked) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          title="Remove from organization"
                          disabled={pending}
                          onClick={() =>
                            openRemoveMemberDialog({
                              userId: m.userId,
                              fullName: m.fullName,
                              email: m.email,
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {draftRows.map((row) => (
                <Fragment key={row.id}>
                  <MemberInviteDraftRow
                    row={row}
                    mode={mode}
                    organizationId={organizationId}
                    pending={pending}
                    inviteRoles={inviteRoles}
                    emailAvailable={emailAvailableByRow[row.id] ?? null}
                    onPatch={updateDraft}
                    onRemove={removeDraft}
                    onAvailabilityChange={setAvailabilityForRow}
                    onActivateInviteSearch={onActivateInviteSearch}
                  />
                  {row.id === inviteSearchActiveRowId && showInviteSearchPanel ? (
                    <tr className="relative z-[100] border-0">
                      <td colSpan={3} className="relative h-0 border-0 p-0 align-top">
                        <div
                          className="absolute left-0 right-0 top-0 z-[100] mx-3 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
                          role="listbox"
                          aria-label="Matching accounts"
                        >
                          {inviteSearchLoading ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Searching…
                            </div>
                          ) : inviteSearchHits.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              No directory accounts match that name or email yet.
                            </div>
                          ) : (
                            <ul className="divide-y divide-border/80 py-1">
                              {inviteSearchHits.map((h) => (
                                <li key={h.id}>
                                  <button
                                    type="button"
                                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-accent"
                                    onMouseDown={(ev) => {
                                      ev.preventDefault();
                                      pickInviteSearchHit(h);
                                    }}
                                  >
                                    <span className="font-medium text-foreground">
                                      {(h.full_name || "").trim() || "—"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {h.email}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </td>
                      <td colSpan={2} className="h-0 border-0 p-0" aria-hidden />
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addDraftRow}
            disabled={pending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Row
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {draftRows.length > 0 ? (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={clearDrafts}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending || !allDraftsValid}
                  onClick={submitDrafts}
                >
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding…
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add users
                    </>
                  )}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={removeTarget != null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove from organization?</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{removeTarget?.label}</span> from
              this organization? Their account is not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setRemoveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => confirmRemoveMember()}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

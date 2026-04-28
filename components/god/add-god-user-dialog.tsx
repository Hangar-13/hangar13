"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";
import { godCreateUser } from "@/app/actions/god-users";
import { GOD_UI_ORG_ROLES, GOD_UI_SYSTEM_ROLES } from "@/lib/god-user-constants";
import { godLookupUserByEmail } from "@/app/actions/god-organizations";
import type { OrganizationRole, SystemRole } from "@/lib/auth-shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OrgRow = {
  id: string;
  organizationId: string;
  role: OrganizationRole;
};

type OrgOption = { id: string; name: string };

type AddGodUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgOptions: OrgOption[];
  onCreated: (userId: string) => void;
};

const orgRoleLabel: Record<OrganizationRole, string> = {
  student: "Student",
  mentor: "Mentor",
  manager: "Manager",
  admin: "Admin",
};

const systemRoleLabel: Record<SystemRole, string> = {
  guest: "Guest",
  student: "Student",
  mentor: "Mentor",
  manager: "Manager",
  admin: "Admin",
  god: "God",
};

function newOrgRow(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: crypto.randomUUID(),
    organizationId: "",
    role: "student",
    ...overrides,
  };
}

export function AddGodUserDialog({ open, onOpenChange, orgOptions, onCreated }: AddGodUserDialogProps) {
  const formId = useId();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [systemRole, setSystemRole] = useState<SystemRole>("student");
  const [orgRows, setOrgRows] = useState<OrgRow[]>([]);
  const [lookup, setLookup] = useState<"idle" | "checking" | "done">("idle");
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setSystemRole("student");
    setOrgRows([]);
    setLookup("idle");
    setEmailAvailable(null);
    setLookupError(null);
    setSubmitting(false);
    setFormError(null);
  };

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  const emailTrim = email.trim();
  const lookupSeqRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!emailRe.test(emailTrim)) {
      setLookup("idle");
      setEmailAvailable(null);
      setLookupError(null);
      return;
    }

    const t = window.setTimeout(() => {
      const seq = ++lookupSeqRef.current;
      setLookup("checking");
      setLookupError(null);
      setEmailAvailable(null);
      void (async () => {
        let res: Awaited<ReturnType<typeof godLookupUserByEmail>>;
        try {
          res = await godLookupUserByEmail(emailTrim);
        } catch (e) {
          if (seq !== lookupSeqRef.current) {
            return;
          }
          setLookup("done");
          setEmailAvailable(false);
          setLookupError(e instanceof Error ? e.message : "Email lookup failed");
          return;
        }
        if (seq !== lookupSeqRef.current) {
          return;
        }
        if (!res.ok) {
          setLookup("done");
          setEmailAvailable(false);
          setLookupError(res.error);
          return;
        }
        if (res.exists) {
          setLookup("done");
          setEmailAvailable(false);
          setLookupError(null);
          return;
        }
        setLookup("done");
        setEmailAvailable(true);
        setLookupError(null);
      })();
    }, 400);

    return () => clearTimeout(t);
  }, [open, emailTrim]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!emailRe.test(emailTrim)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (lookup === "checking") {
      setFormError("Wait for the email check to finish.");
      return;
    }
    if (emailAvailable !== true) {
      setFormError("This email is not available for a new user.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setFormError("First and last name are required.");
      return;
    }
    const withOrg = orgRows.filter((r) => r.organizationId);
    const orgIds = withOrg.map((r) => r.organizationId);
    if (new Set(orgIds).size !== orgIds.length) {
      setFormError("Each organization can only appear once.");
      return;
    }
    setSubmitting(true);
    const res = await godCreateUser({
      email: emailTrim,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      systemRole,
      organizations: withOrg.map((r) => ({
        organizationId: r.organizationId,
        role: r.role,
      })),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    handleOpenChange(false);
    onCreated(res.userId);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(90vh,900px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new user</DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-email`}>Email</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`${formId}-email`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLookup("idle");
                  setEmailAvailable(null);
                  setLookupError(null);
                }}
                type="email"
                required
                autoComplete="off"
                placeholder="name@example.com"
              />
              {emailRe.test(emailTrim) && lookup === "checking" && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
              {lookup === "done" && emailAvailable === true && (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-green-600"
                  aria-label="Email is available"
                />
              )}
              {lookup === "done" && emailAvailable === false && !lookupError && (
                <XCircle
                  className="h-4 w-4 shrink-0 text-destructive"
                  aria-label="Email is already taken"
                />
              )}
              {lookup === "done" && lookupError && (
                <XCircle
                  className="h-4 w-4 shrink-0 text-destructive"
                  aria-label="Lookup error"
                />
              )}
            </div>
            {lookup === "done" && emailAvailable === false && !lookupError && (
              <p className="text-xs text-destructive" role="alert">
                A user with this email already exists
              </p>
            )}
            {lookupError && (
              <p className="text-xs text-destructive" role="alert">
                {lookupError}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-first`}>First name</Label>
              <Input
                id={`${formId}-first`}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-last`}>Last name</Label>
              <Input
                id={`${formId}-last`}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role (system)</Label>
            <Select value={systemRole} onValueChange={(v) => setSystemRole(v as SystemRole)}>
              <SelectTrigger className="w-full" size="default">
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
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Organizations</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setOrgRows((p) => [...p, newOrgRow()])}
              >
                <Plus className="h-4 w-4" />
                Add organization
              </Button>
            </div>
            {orgRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organizations added. Optional: add the user to one or more orgs with a role in each.</p>
            ) : (
              <div className="space-y-2 rounded-md border p-2">
                {orgRows.map((row, i) => (
                  <div
                    key={row.id}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <Select
                      value={row.organizationId || "none"}
                      onValueChange={(v) => {
                        const next = v === "none" ? "" : v;
                        setOrgRows((prev) => {
                          const c = [...prev];
                          c[i] = { ...c[i]!, organizationId: next };
                          return c;
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Organization" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {orgOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.role}
                      onValueChange={(v) => {
                        setOrgRows((prev) => {
                          const c = [...prev];
                          c[i] = { ...c[i]!, role: v as OrganizationRole };
                          return c;
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GOD_UI_ORG_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {orgRoleLabel[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

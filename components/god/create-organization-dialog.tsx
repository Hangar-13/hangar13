"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { godCreateOrganizationWithUsers, godLookupUserByEmail } from "@/app/actions/god-organizations";
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
import { cn } from "@/lib/utils";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailsEqual(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type Row = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isNew: boolean | null;
  lookup: "idle" | "checking" | "done";
  /** Set when server lookup failed (shown next to email). */
  lookupError: string | null;
};

function newRow(overrides: Partial<Row> = {}): Row {
  return {
    id: crypto.randomUUID(),
    email: "",
    firstName: "",
    lastName: "",
    isNew: null,
    lookup: "idle",
    lookupError: null,
    ...overrides,
  };
}

type OrgUserRowBlockProps = {
  row: Row;
  isLead: boolean;
  onLead: () => void;
  onPatch: (patch: Partial<Row>) => void;
  onReplace: (updater: (r: Row) => Row) => void;
};

function OrgUserRowBlock({ row, isLead, onLead, onPatch, onReplace }: OrgUserRowBlockProps) {
  const onReplaceRef = useRef(onReplace);
  const lookupSeqRef = useRef(0);
  useLayoutEffect(() => {
    onReplaceRef.current = onReplace;
  });

  useEffect(() => {
    const replace = (u: (r: Row) => Row) => onReplaceRef.current(u);
    const email = row.email.trim();
    if (!emailRe.test(email)) {
      replace((current) => {
        if (current.lookup === "idle" && current.isNew === null && current.lookupError == null) {
          return current;
        }
        return {
          ...current,
          lookup: "idle" as const,
          isNew: null,
          firstName: "",
          lastName: "",
          lookupError: null,
        };
      });
      return;
    }

    const t = window.setTimeout(() => {
      const seq = ++lookupSeqRef.current;
      replace((current) => {
        if (!emailsEqual(current.email, email)) {
          return current;
        }
        return { ...current, lookup: "checking" as const, lookupError: null };
      });
      const lookupEmail = email;
      void (async () => {
        let res: Awaited<ReturnType<typeof godLookupUserByEmail>>;
        try {
          res = await godLookupUserByEmail(lookupEmail);
        } catch (e) {
          replace((current) => {
            if (seq !== lookupSeqRef.current) {
              return current;
            }
            if (!emailsEqual(current.email, email)) {
              return current;
            }
            return {
              ...current,
              lookup: "done" as const,
              isNew: null,
              lookupError: e instanceof Error ? e.message : "Email lookup failed",
            };
          });
          return;
        }
        replace((current) => {
          if (seq !== lookupSeqRef.current) {
            return current;
          }
          if (!emailsEqual(current.email, email)) {
            return current;
          }
          if (!res.ok) {
            return {
              ...current,
              lookup: "done" as const,
              isNew: null,
              lookupError: res.error,
            };
          }
          if (res.ok && res.exists) {
            return {
              ...current,
              lookup: "done" as const,
              isNew: false,
              firstName: res.firstName ?? "",
              lastName: res.lastName ?? "",
              lookupError: null,
            };
          }
          return {
            ...current,
            lookup: "done" as const,
            isNew: true,
            firstName: "",
            lastName: "",
            lookupError: null,
          };
        });
      })();
    }, 400);

    return () => clearTimeout(t);
  }, [row.id, row.email]);

  return (
    <tr className="border-b last:border-0">
      <td className="p-2 align-middle">
        <input
          type="radio"
          name="org-lead"
          checked={isLead}
          onChange={onLead}
          className="h-4 w-4 accent-primary"
          aria-label="Lead"
        />
      </td>
      <td className="p-2 align-middle">
        <div className="flex items-center gap-2">
          <Input
            className="min-w-0"
            value={row.email}
            onChange={(e) =>
              onPatch({
                email: e.target.value,
                isNew: null,
                lookup: "idle",
                firstName: "",
                lastName: "",
                lookupError: null,
              })
            }
            type="email"
            required
            autoComplete="off"
            placeholder="name@example.com"
          />
          {emailRe.test(row.email.trim()) && row.lookup === "checking" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          {row.lookup === "done" && row.isNew === false && (
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-green-600"
              aria-label="User exists in system"
            />
          )}
          {row.lookup === "done" && row.isNew === true && (
            <span
              className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
              aria-label="New user"
            >
              New
            </span>
          )}
        </div>
        {row.lookupError && (
          <p className="text-xs text-destructive mt-1" role="alert">
            {row.lookupError}
          </p>
        )}
      </td>
      <td className="p-2">
        <Input
          value={row.firstName}
          onChange={(e) => onPatch({ firstName: e.target.value })}
          disabled={row.isNew === false}
          className={cn(row.isNew === false && "bg-muted")}
          required={row.isNew === true}
        />
      </td>
      <td className="p-2">
        <Input
          value={row.lastName}
          onChange={(e) => onPatch({ lastName: e.target.value })}
          disabled={row.isNew === false}
          className={cn(row.isNew === false && "bg-muted")}
          required={row.isNew === true}
        />
      </td>
    </tr>
  );
}

type CreateOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (organizationId: string) => void;
};

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateOrganizationDialogProps) {
  const formId = useId();
  const [orgName, setOrgName] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [leadIndex, setLeadIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOrgName("");
    setRows([newRow()]);
    setLeadIndex(0);
    setError(null);
    setSubmitting(false);
  };

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  const updateRow = (i: number, next: Row | ((r: Row) => Row)) => {
    setRows((prev) => {
      const copy = [...prev];
      const cur = copy[i]!;
      const resolved = typeof next === "function" ? next(cur) : next;
      copy[i] = resolved;
      return copy;
    });
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    for (const r of rows) {
      if (!emailRe.test(r.email.trim())) {
        setError("Enter a valid email address in every row.");
        return;
      }
      if (r.lookup === "checking") {
        setError("Wait for email checks to finish.");
        return;
      }
      if (r.isNew === null) {
        setError("Each email must be resolved (valid format and lookup).");
        return;
      }
      if (r.isNew) {
        if (!r.firstName.trim() || !r.lastName.trim()) {
          setError("First and last name are required for new users.");
          return;
        }
      }
    }

    setSubmitting(true);
    const payload = {
      name: orgName.trim(),
      users: rows.map((r, i) => ({
        email: r.email.trim(),
        firstName: r.firstName,
        lastName: r.lastName,
        isNew: r.isNew === true,
        lead: i === leadIndex,
      })),
    };
    const res = await godCreateOrganizationWithUsers(payload);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    handleOpenChange(false);
    onCreated(res.organizationId);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(90vh,900px)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create New Org</DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-name`}>Organization name</Label>
            <Input
              id={`${formId}-name`}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Users</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-2 font-medium w-20">Lead</th>
                    <th className="p-2 font-medium">Email address</th>
                    <th className="p-2 font-medium">First name</th>
                    <th className="p-2 font-medium">Last name</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <OrgUserRowBlock
                      key={row.id}
                      row={row}
                      isLead={leadIndex === i}
                      onLead={() => setLeadIndex(i)}
                      onPatch={(p) => updateRow(i, (r) => ({ ...r, ...p }))}
                      onReplace={(u) => updateRow(i, u)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setRows((p) => [...p, newRow()])}
            >
              <Plus className="h-4 w-4" />
              Add Another User
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
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
              "Create Org"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

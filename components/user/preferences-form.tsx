"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { updateDefaultStartPath } from "@/app/actions/user-settings";
import { highestOrganizationRole } from "@/lib/auth-shared";
import {
  collectStartPathOptions,
  roleDefaultStartPath,
} from "@/lib/user-start-path";

const CUSTOM_VALUE = "__custom__";
const DEFAULT_VALUE = "__default__";

export function PreferencesForm({
  initialDefaultStartPath,
  roleDefaultPath,
}: {
  initialDefaultStartPath: string | null;
  roleDefaultPath: string;
}) {
  const { navigationSections, systemRole, organizationRole, memberships } =
    useAppNavigation();

  const startPathOptions = useMemo(
    () => collectStartPathOptions(navigationSections),
    [navigationSections]
  );

  const computedRoleDefault =
    systemRole != null
      ? roleDefaultStartPath(
          systemRole,
          memberships.length > 0
            ? highestOrganizationRole(memberships.map((m) => m.role))
            : organizationRole
        )
      : roleDefaultPath;

  const initialSelectValue = initialDefaultStartPath
    ? startPathOptions.some((o) => o.href === initialDefaultStartPath)
      ? initialDefaultStartPath
      : CUSTOM_VALUE
    : DEFAULT_VALUE;

  const [selected, setSelected] = useState(initialSelectValue);
  const [customPath, setCustomPath] = useState(
    initialSelectValue === CUSTOM_VALUE ? (initialDefaultStartPath ?? "") : ""
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setIsSaving(true);

    try {
      let value: string | null = null;
      if (selected === DEFAULT_VALUE) {
        value = null;
      } else if (selected === CUSTOM_VALUE) {
        value = customPath;
      } else {
        value = selected;
      }

      const result = await updateDefaultStartPath(value);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.savedPath) {
        setMessage(`Starting page saved: ${result.savedPath}`);
      } else {
        setMessage(
          `Starting page reset to your role default (${computedRoleDefault}).`
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="startingPage">Starting page</Label>
        <p className="text-sm text-muted-foreground">
          Choose where you land after signing in. Your role default is{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {computedRoleDefault}
          </code>
          .
        </p>
        <Select
          value={selected}
          onValueChange={(value) => {
            setSelected(value);
            setMessage(null);
            setError(null);
          }}
        >
          <SelectTrigger id="startingPage" className="w-full">
            <SelectValue placeholder="Select a starting page" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_VALUE}>
              Role default ({computedRoleDefault})
            </SelectItem>
            {startPathOptions.map((option) => (
              <SelectItem key={option.href} value={option.href}>
                {option.label} ({option.href})
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_VALUE}>Custom URL or path…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected === CUSTOM_VALUE ? (
        <div className="space-y-2">
          <Label htmlFor="customStartPath">Custom path or URL</Label>
          <Input
            id="customStartPath"
            placeholder="/dashboard/student/logbook"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Paste a dashboard path (for example{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              /dashboard/student/training
            </code>
            ) or a full URL on this site.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <Button type="submit" disabled={isSaving}>
        {isSaving ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}

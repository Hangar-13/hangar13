import {
  defaultDashboardPathForOrgRole,
  hasPlatformAdminAccess,
  type OrganizationRole,
  type SystemRole,
} from "@/lib/auth-shared";
import { isNavGroup, type NavSection } from "@/lib/navigation";

export type StartPathOption = {
  label: string;
  href: string;
};

/** Collect navigable dashboard paths from sidebar sections for the start-page picker. */
export function collectStartPathOptions(
  sections: NavSection[]
): StartPathOption[] {
  const seen = new Set<string>();
  const options: StartPathOption[] = [];

  function add(label: string, href: string) {
    if (seen.has(href)) return;
    seen.add(href);
    options.push({ label, href });
  }

  for (const section of sections) {
    for (const entry of section.items) {
      if (isNavGroup(entry)) {
        add(entry.name, entry.defaultHref);
        for (const child of entry.children) {
          if (!child.disabled) {
            add(child.name, child.href);
          }
        }
      } else if (!entry.disabled) {
        add(entry.name, entry.href);
      }
    }
  }

  return options;
}

/** Normalize pasted path or same-origin URL to a safe relative path. */
export function normalizeUserStartPath(
  input: string,
  origin?: string
): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.startsWith("/")) {
      if (trimmed.startsWith("//")) {
        return null;
      }
      const url = new URL(trimmed, origin ?? "http://localhost");
      return `${url.pathname}${url.search}`;
    }

    if (!origin) {
      return null;
    }

    const url = new URL(trimmed);
    if (url.origin !== new URL(origin).origin) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Paths users may choose as a post-login landing page. */
export function isAllowedStartPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }
  if (path.startsWith("/api/") || path.startsWith("/auth/")) {
    return false;
  }
  return path.startsWith("/dashboard");
}

export function roleDefaultStartPath(
  systemRole: SystemRole,
  orgRole: OrganizationRole | null
): string {
  if (hasPlatformAdminAccess(systemRole)) {
    return "/dashboard/god";
  }
  return defaultDashboardPathForOrgRole(orgRole);
}

export function resolveUserStartPath(
  systemRole: SystemRole,
  orgRole: OrganizationRole | null,
  preferredPath: string | null | undefined,
  origin?: string
): string {
  const fallback = roleDefaultStartPath(systemRole, orgRole);
  if (!preferredPath?.trim()) {
    return fallback;
  }

  const normalized = normalizeUserStartPath(preferredPath, origin);
  if (!normalized || !isAllowedStartPath(normalized)) {
    return fallback;
  }

  return normalized;
}

/** Derive 1–2 letter initials for avatar display. */
export function getUserInitials(
  fullName: string | null | undefined,
  email: string | null | undefined
): string {
  const name = fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
    }
    if (parts[0]!.length >= 2) {
      return parts[0]!.slice(0, 2).toUpperCase();
    }
    return parts[0]!.slice(0, 1).toUpperCase();
  }

  const local = email?.split("@")[0]?.trim();
  if (local && local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  if (local) {
    return local.slice(0, 1).toUpperCase();
  }

  return "?";
}

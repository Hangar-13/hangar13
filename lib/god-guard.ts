import { getActiveUser } from "@/lib/auth";
import { hasPlatformAdminAccess } from "@/lib/auth-shared";
import type { ActiveUser } from "@/lib/auth-shared";

/**
 * Server-only. Redirects users who are not system admin or god to the mentor dashboard.
 */
export async function requirePlatformAdmin(): Promise<ActiveUser> {
  const user = await getActiveUser();
  if (!user || !hasPlatformAdminAccess(user.role)) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard/mentor");
  }
  return user!;
}

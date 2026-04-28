import type { SupabaseClient } from "@supabase/supabase-js";

/** Path visibilities a trainee may self-enroll from Find Training (not draft/unreleased). */
export async function listUserOrganizationIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);

  return (data ?? []).map((r) => r.organization_id as string);
}

/**
 * PostgREST `.or()` filter: public paths, or proprietary paths in one of the user's orgs.
 */
export function discoverableTrainingPathsOrFilter(orgIds: string[]): string {
  if (orgIds.length === 0) {
    return "visibility.eq.public";
  }
  const inList = orgIds.join(",");
  return `visibility.eq.public,and(visibility.eq.proprietary,organization_id.in.(${inList}))`;
}

/**
 * Server-side guard mirroring Find Training (self-serve enroll).
 */
export function userMaySelfEnrollFromVisibility(args: {
  visibility: string;
  pathOrganizationId: string;
  userOrganizationIds: string[];
  isPlatformAdmin: boolean;
}): boolean {
  if (args.isPlatformAdmin) return true;
  switch (args.visibility) {
    case "public":
      return true;
    case "proprietary":
      return args.userOrganizationIds.includes(args.pathOrganizationId);
    case "unreleased":
    case "draft":
    default:
      return false;
  }
}

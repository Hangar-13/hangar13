import { godListOrganizations } from "@/app/actions/god-organizations";
import { OrganizationsPageClient } from "@/components/god/organizations-page-client";
import { requirePlatformAdmin } from "@/lib/god-guard";

export default async function GodOrganizationsPage() {
  await requirePlatformAdmin();
  const res = await godListOrganizations();
  if (!res.ok) {
    return (
      <p className="text-destructive" role="alert">
        {res.error}
      </p>
    );
  }
  return <OrganizationsPageClient initialOrgs={res.organizations} />;
}

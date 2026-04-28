import { godListUsersPaginated } from "@/app/actions/god-users";
import { godListOrganizations } from "@/app/actions/god-organizations";
import { GodUsersPageClient } from "@/components/god/god-users-page-client";
import { requirePlatformAdmin } from "@/lib/god-guard";

export default async function GodUsersPage() {
  await requirePlatformAdmin();

  const [listRes, orgRes] = await Promise.all([
    godListUsersPaginated({ search: "", page: 0, pageSize: 20 }),
    godListOrganizations(),
  ]);

  if (!listRes.ok) {
    return (
      <p className="text-destructive" role="alert">
        {listRes.error}
      </p>
    );
  }
  if (!orgRes.ok) {
    return (
      <p className="text-destructive" role="alert">
        {orgRes.error}
      </p>
    );
  }

  return (
    <GodUsersPageClient
      initialRows={listRes.rows}
      initialTotal={listRes.total}
      orgOptions={orgRes.organizations.map((o) => ({ id: o.id, name: o.name }))}
    />
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { godGetOrganization } from "@/app/actions/god-organizations";
import { OrgMembersPanel } from "@/components/organization/org-members-panel";
import { formatUiDate } from "@/lib/format-ui-date";
import { requirePlatformAdmin } from "@/lib/god-guard";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function GodOrganizationDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const { id } = await params;
  const res = await godGetOrganization(id);
  if (!res.ok) {
    notFound();
  }
  const { org } = res;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/god/organizations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organizations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {org.memberCount} {org.memberCount === 1 ? "person" : "people"} in this organization
        </p>
      </div>

      <section className="space-y-3">
        <OrgMembersPanel
          mode="god"
          organizationId={org.id}
          members={org.members}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Training paths</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Licenses purchased</th>
                <th className="p-3 font-medium">Expiration</th>
              </tr>
            </thead>
            <tbody>
              {org.trainingMaterial.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                    No training paths in this org yet.
                  </td>
                </tr>
              ) : (
                org.trainingMaterial.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{row.name}</td>
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {row.licensesPurchased}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatUiDate(row.expirationDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

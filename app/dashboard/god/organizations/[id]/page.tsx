import Link from "next/link";
import { notFound } from "next/navigation";
import { godGetOrganization } from "@/app/actions/god-organizations";
import { LeadBadge } from "@/components/god/lead-badge";
import { requirePlatformAdmin } from "@/lib/god-guard";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(iso: string | null) {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

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
        <h2 className="text-lg font-medium">Users</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {org.members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                    No members.
                  </td>
                </tr>
              ) : (
                org.members.map((m) => {
                  const isLead = m.userId === org.leadUserId;
                  return (
                    <tr key={m.userId} className="border-b last:border-0">
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <span>{m.fullName || "—"}</span>
                          {isLead && <LeadBadge />}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{m.email || "—"}</td>
                      <td className="p-3 capitalize text-muted-foreground">{m.orgRole}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
                      {formatDate(row.expirationDate)}
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

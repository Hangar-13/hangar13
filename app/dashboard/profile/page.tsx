import { redirect } from "next/navigation";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";
import { ProfileForm } from "@/components/user/profile-form";
import { CertificationStatusSection } from "@/components/user/certification-status-section";
import { getCertificationStatus } from "@/app/actions/apprenticeship-status";
import { getUserSettings } from "@/app/actions/user-settings";

export default async function ProfilePage() {
  const [settings, certification] = await Promise.all([
    getUserSettings(),
    getCertificationStatus(),
  ]);
  if ("error" in settings) {
    redirect("/auth/login");
  }

  return (
    <DashboardPageShell>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Update your name, email, and password.
        </p>
      </div>

      <DashboardContentFrame className="space-y-8">
        <ProfileForm
          initialFullName={settings.fullName ?? ""}
          initialEmail={settings.email ?? ""}
        />
        {"error" in certification ? (
          <p className="text-sm text-muted-foreground">{certification.error}</p>
        ) : (
          <CertificationStatusSection status={certification} />
        )}
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

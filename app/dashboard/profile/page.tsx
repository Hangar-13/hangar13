import { redirect } from "next/navigation";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";
import { ProfileForm } from "@/components/user/profile-form";
import { getUserSettings } from "@/app/actions/user-settings";

export default async function ProfilePage() {
  const settings = await getUserSettings();
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

      <DashboardContentFrame>
        <ProfileForm
          initialFullName={settings.fullName ?? ""}
          initialEmail={settings.email ?? ""}
        />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

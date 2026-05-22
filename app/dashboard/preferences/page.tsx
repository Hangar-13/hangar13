import { redirect } from "next/navigation";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";
import { PreferencesForm } from "@/components/user/preferences-form";
import { getUserSettings } from "@/app/actions/user-settings";

export default async function PreferencesPage() {
  const settings = await getUserSettings();
  if ("error" in settings) {
    redirect("/auth/login");
  }

  return (
    <DashboardPageShell>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Preferences</h1>
        <p className="text-sm text-muted-foreground">
          Customize how the app behaves for your account.
        </p>
      </div>

      <DashboardContentFrame>
        <PreferencesForm
          initialDefaultStartPath={settings.defaultStartPath}
          roleDefaultPath={settings.roleDefaultStartPath}
        />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

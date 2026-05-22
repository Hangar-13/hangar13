import { FileText, BarChart3, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";
import { redirect } from "next/navigation";
import {
  DashboardContentFrame,
  DashboardPageShell,
  DashboardSectionLabel,
} from "@/components/dashboard/page-shell";

async function getUserProfile(userId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return null;
  }
  const profile = await fetchSessionUserProfile(supabase);
  if (!profile) return null;
  return { full_name: profile.full_name };
}

export default async function Home() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await getUserProfile(user.id);
  const firstName = profile?.full_name?.split(" ")[0] || "there";

  const links = [
    {
      title: "Projects",
      description: "Manage your projects and track their progress.",
      icon: FileText,
    },
    {
      title: "Analytics",
      description: "View detailed analytics and insights.",
      icon: BarChart3,
    },
    {
      title: "Team",
      description: "Collaborate with your team members.",
      icon: Users,
    },
  ];

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {firstName}</h1>
        <p className="text-base text-muted-foreground">
          Keep up the great work on your aviation journey
        </p>
      </div>

      <DashboardContentFrame className="space-y-6">
        <DashboardSectionLabel>Quick links</DashboardSectionLabel>
        <ul className="divide-y divide-border/25">
          {links.map(({ title, description, icon: Icon }) => (
            <li key={title} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

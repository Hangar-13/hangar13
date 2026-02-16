import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, BarChart3, Users, TrendingUp } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

async function getUserProfile(userId: string) {
  const supabase = await createServerSupabaseClient();
  
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile;
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

  return (
    <div className="space-y-8">
      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {firstName}</h1>
        <p className="text-muted-foreground text-base">
          Keep up the great work on your aviation journey
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="transition-all hover:shadow-md hover:border-primary/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Projects</CardTitle>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage your projects and track their progress.
            </p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md hover:border-primary/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Analytics</CardTitle>
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              View detailed analytics and insights.
            </p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md hover:border-primary/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Team</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Collaborate with your team members.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

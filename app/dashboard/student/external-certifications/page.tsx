import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";
import { ExternalCertificationForm } from "@/components/student/external-certification-form";

export default async function ExternalCertificationsPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          External certifications
        </h1>
        <p className="text-base text-muted-foreground">
          Record certifications earned outside Hangar13 — factory schools, forklift
          training, employer programs, and other credentials.
        </p>
        <p className="text-sm text-muted-foreground">
          Return to{" "}
          <Link
            href="/dashboard/student/skills"
            className="text-primary underline underline-offset-4"
          >
            Skills profile
          </Link>
          {" · "}
          <Link
            href="/dashboard/student/certification"
            className="text-primary underline underline-offset-4"
          >
            Certification
          </Link>
          .
        </p>
      </div>

      <DashboardContentFrame>
        <ExternalCertificationForm />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { godGetUserDetail } from "@/app/actions/god-users";
import { GodUserDetailClient } from "@/components/god/god-user-detail-client";
import { requirePlatformAdmin } from "@/lib/god-guard";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function GodUserDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const { id } = await params;
  const res = await godGetUserDetail(id);
  if (!res.ok) {
    if (res.error === "User not found.") {
      notFound();
    }
    return (
      <p className="text-destructive" role="alert">
        {res.error}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="link" asChild className="h-auto p-0 text-muted-foreground">
          <Link href="/dashboard/god/users">← Users</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">
          {res.user.fullName?.trim() || res.user.email || "User"}
        </h1>
      </div>
      <GodUserDetailClient user={res.user} />
    </div>
  );
}

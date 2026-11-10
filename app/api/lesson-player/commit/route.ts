import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { commitLessonPlayerAttempt } from "@/lib/lesson-player";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const record = body as { packageId?: unknown; cmi?: unknown; finish?: unknown };
  if (typeof record.packageId !== "string" || !record.cmi || typeof record.cmi !== "object") {
    return NextResponse.json({ error: "Missing package." }, { status: 400 });
  }

  const result = await commitLessonPlayerAttempt(supabase, {
    userId: user.id,
    packageId: record.packageId,
    cmi: record.cmi as Record<string, unknown>,
    finish: record.finish === true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

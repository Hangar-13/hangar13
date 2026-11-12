import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { readLessonPackageFile } from "@/lib/lesson-player";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ packageId: string; path: string[] }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { packageId, path } = await ctx.params;
  const relativePath = (path ?? []).map(decodeURIComponent).join("/");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const file = await readLessonPackageFile(supabase, packageId, relativePath);
  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(Buffer.from(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

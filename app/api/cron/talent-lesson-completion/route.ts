import { NextRequest, NextResponse } from "next/server";

import { isTalentLessonCompletionCronEnabled } from "@/lib/talentlms/reconcile-cron-flag";
import { isPacificTalentReconcileWindow } from "@/lib/talentlms/reconcile-schedule";
import { runTalentLessonCompletionReconcile } from "@/lib/talentlms/reconcile-lesson-completion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby: 60s cap; bump on Pro when submission volume grows. */
export const maxDuration = 300;

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

  /** Manual / CI triggers matching CRON_SECRET. */
  if (secret && bearer === secret) return true;

  /** Vercel Cron invokes `x-vercel-cron: 1` when deployed on Vercel. */
  if (
    request.headers.get("x-vercel-cron") === "1" &&
    Boolean(process.env.VERCEL ?? process.env.VERCEL_ENV)
  ) {
    return true;
  }

  /** Local dev before CRON_SECRET is configured (do not use in prod without other controls). */
  return !secret && process.env.NODE_ENV !== "production";
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTalentLessonCompletionCronEnabled()) {
    return NextResponse.json(
      {
        ok: true,
        disabled: true,
        hint: "Polling is disabled. Set TALENTLMS_RECONCILE_CRON_ENABLED=true on the deployment and restore the cron entry in vercel.json to re-enable.",
      },
      { status: 200 }
    );
  }

  const force =
    request.nextUrl.searchParams.get("force") === "1" ||
    request.nextUrl.searchParams.get("force") === "true";

  if (!force && !isPacificTalentReconcileWindow()) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason:
          "Outside America/Los_Angeles sync window (~5am and ~noon). Pass ?force=1 (with Bearer CRON_SECRET) to run manually.",
      },
      { status: 202 }
    );
  }

  try {
    const summary = await runTalentLessonCompletionReconcile();
    return NextResponse.json({ ok: true, ...summary }, { status: 200 });
  } catch (e) {
    console.error("[cron] talent-lesson-completion failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : "Talent reconcile failed unexpectedly.",
      },
      { status: 500 }
    );
  }
}

/**
 * Periodic Talent LMS → Hangar reconcile: refresh unit completion snapshots on submissions
 * without requiring the learner to click “Update Progress”.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  getTalentLmsApiEnrollmentConfig,
  talentLmsGetUserStatusInCourse,
  talentLmsIsUnitCompletedInPayload,
  talentLmsResolveLearnerUserIdFromEmails,
} from "@/lib/talentlms/api-enroll";
import { getLessonTalentContext } from "@/lib/talentlms/lesson-talent-context";

export type TalentReconcileRunSummary = Readonly<{
  candidates: number;
  eligible: number;
  updated: number;
  skipped: number;
  failed: number;
  /** First few failures for ops visibility */
  failures: readonly string[];
}>;

type LessonSubmissionRow = {
  id: string;
  lesson_id: string;
  user_training_id: string;
};

type TalentStoredFields = {
  talent_lms_unit_completed: boolean | null;
  talent_lms_completion_checked_at: string | null;
  talent_lms_completion_meta: Record<string, unknown> | null;
};

const PAGE_SIZE = 100;
const BETWEEN_ROWS_MS = 150;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function computeTalentStoredFields(params: Readonly<{
  supabase: SupabaseClient;
  lessonId: string;
  learnerUserId: string;
  learnerEmails: readonly string[];
}>): Promise<TalentStoredFields> {
  const ctx = await getLessonTalentContext(params.supabase, params.lessonId);
  const { talentUrl, courseId, unitId } = ctx;
  const checkedIso = new Date().toISOString();

  const apiConfig = getTalentLmsApiEnrollmentConfig();

  if (!apiConfig) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: checkedIso,
      talent_lms_completion_meta: {
        reconcile: true,
        skip_reason: "api_not_configured",
      },
    };
  }

  if (!talentUrl) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: checkedIso,
      talent_lms_completion_meta: {
        reconcile: true,
        skip_reason: "no_talent_link_in_lesson",
      },
    };
  }

  if (!courseId || !unitId) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: checkedIso,
      talent_lms_completion_meta: {
        reconcile: true,
        skip_reason: "could_not_resolve_course_or_unit",
        course_id: courseId,
        unit_id: unitId,
        talent_url: talentUrl,
      },
    };
  }

  const lookupEmails = params.learnerEmails.filter(
    (e): e is string => typeof e === "string" && e.trim().length > 0
  );

  if (lookupEmails.length === 0) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: checkedIso,
      talent_lms_completion_meta: {
        reconcile: true,
        skip_reason: "no_learner_email",
        user_training_user_id: params.learnerUserId,
      },
    };
  }

  const tlUser = await talentLmsResolveLearnerUserIdFromEmails(
    apiConfig,
    lookupEmails
  );

  if (!tlUser.ok) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: checkedIso,
      talent_lms_completion_meta: {
        reconcile: true,
        skip_reason:
          tlUser.status === 404 ? "talent_user_not_found" : "talent_user_lookup_failed",
        http_status: tlUser.status,
        message: tlUser.message,
        emails_attempted: lookupEmails,
      },
    };
  }

  const progress = await talentLmsGetUserStatusInCourse({
    config: apiConfig,
    userId: tlUser.userId,
    courseId,
  });

  if (!progress.ok) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: checkedIso,
      talent_lms_completion_meta: {
        reconcile: true,
        skip_reason: "course_status_fetch_failed",
        http_status: progress.status,
        message: progress.message,
        course_id: courseId,
        unit_id: unitId,
        talent_url: talentUrl,
      },
    };
  }

  const verdict = talentLmsIsUnitCompletedInPayload(progress.payload, unitId);

  if (!verdict.found) {
    return {
      talent_lms_unit_completed: false,
      talent_lms_completion_checked_at: checkedIso,
      talent_lms_completion_meta: {
        reconcile: true,
        skip_reason: "unit_not_present_in_course_payload",
        course_id: courseId,
        unit_id: unitId,
        talent_url: talentUrl,
        course_completion_status: progress.payload.completion_status,
      },
    };
  }

  const unitSnap = progress.payload.units?.find(
    (u) => String(u.id ?? "") === String(unitId)
  );

  return {
    talent_lms_unit_completed: verdict.completed,
    talent_lms_completion_checked_at: checkedIso,
    talent_lms_completion_meta: {
      reconcile: true,
      course_id: courseId,
      unit_id: unitId,
      talent_url: talentUrl,
      course_completion_status: progress.payload.completion_status,
      unit: unitSnap,
    },
  };
}

/**
 * Loads submitted lesson reflections and refreshes Talent completion columns from Talent’s API.
 *
 * Runs with the **service role** Supabase client (bypass RLS).
 */
export async function runTalentLessonCompletionReconcile(): Promise<TalentReconcileRunSummary> {
  let candidates = 0;
  let eligible = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  if (!process.env.TALENTLMS_API_KEY?.trim() || !process.env.TALENTLMS_SUBDOMAIN?.trim()) {
    return {
      candidates: 0,
      eligible: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    };
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch (e) {
    return {
      candidates: 0,
      eligible: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
      failures: [
        e instanceof Error ? e.message : "SUPABASE_SERVICE_ROLE_KEY is required for reconcile.",
      ],
    };
  }

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: batch, error } = await admin
      .from("lesson_submissions")
      .select("id, lesson_id, user_training_id")
      .neq("status", "draft")
      .not("submitted_at", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      failed += 1;
      if (failures.length < 6) failures.push(error.message);
      break;
    }

    if (!batch?.length) break;

    const rows = batch as LessonSubmissionRow[];
    candidates += rows.length;

    const utIds = [...new Set(rows.map((r) => r.user_training_id))];
    const { data: utRows, error: utErr } = await admin
      .from("user_trainings")
      .select("id, user_id")
      .in("id", utIds);

    if (utErr || !utRows?.length) {
      failed += 1;
      if (failures.length < 6) failures.push(utErr?.message ?? "user_trainings load failed");
      continue;
    }

    const utToUser = new Map(
      utRows.map((r) => [r.id as string, r.user_id as string])
    );

    const userIds = [...new Set([...utToUser.values()])];

    /** Auth email beats `public.users.email` mismatches vs Talent SSO mapping. */
    const emailByAuthId = new Map<string, string>();
    for (const uid of userIds) {
      const { data, error: uErr } = await admin.auth.admin.getUserById(uid);
      if (!uErr && data.user?.email?.trim()) {
        emailByAuthId.set(uid, data.user.email.trim().toLowerCase());
      }
    }

    const { data: profiles, error: profErr } = await admin
      .from("users")
      .select("id, email")
      .in("id", userIds);

    if (profErr) {
      failed += 1;
      if (failures.length < 6) failures.push(profErr.message);
      continue;
    }

    const pubEmailById = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        typeof p.email === "string" && p.email.trim()
          ? p.email.trim().toLowerCase()
          : null,
      ])
    );

    const lessonIds = [...new Set(rows.map((r) => r.lesson_id))];

    const { data: lessonRows } = await admin
      .from("lessons")
      .select("id,talent_lms_unit_id")
      .in("id", lessonIds);

    const hasTalentUnitByLesson = new Set(
      (lessonRows ?? [])
        .filter(
          (l) =>
            typeof l.talent_lms_unit_id === "string" &&
            l.talent_lms_unit_id.trim().length > 0
        )
        .map((l) => l.id as string)
    );

    for (const row of rows) {
      if (!hasTalentUnitByLesson.has(row.lesson_id)) {
        skipped += 1;
        continue;
      }

      const learnerUid = utToUser.get(row.user_training_id);
      if (!learnerUid) {
        skipped += 1;
        continue;
      }

      eligible += 1;
      await sleep(BETWEEN_ROWS_MS);

      const emails = uniqStrings([
        emailByAuthId.get(learnerUid),
        pubEmailById.get(learnerUid),
      ]);

      try {
        const computed = await computeTalentStoredFields({
          supabase: admin,
          lessonId: row.lesson_id,
          learnerUserId: learnerUid,
          learnerEmails: emails,
        });

        const { error: updErr } = await admin
          .from("lesson_submissions")
          .update({
            talent_lms_unit_completed: computed.talent_lms_unit_completed,
            talent_lms_completion_checked_at:
              computed.talent_lms_completion_checked_at,
            talent_lms_completion_meta: computed.talent_lms_completion_meta,
          })
          .eq("id", row.id);

        if (updErr) {
          failed += 1;
          if (failures.length < 6) failures.push(`${row.id}: ${updErr.message}`);
        } else {
          updated += 1;
        }
      } catch (e) {
        failed += 1;
        if (failures.length < 6) {
          failures.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  return { candidates, eligible, updated, skipped, failed, failures };
}

function uniqStrings(raw: Iterable<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = r?.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTalentLmsCoursePlayUrl,
} from "@/lib/talentlms/lesson-url";
import { resolveTalentLmsCourseAndUnitForLesson } from "@/lib/talentlms/lesson-talent-context";
import {
  ensureTalentLmsUserAndEnrollInCourse,
  getTalentLmsApiEnrollmentConfig,
  talentLmsIsRequestedUserGone,
  talentLmsResolveLearnerUserIdFromEmails,
  talentLmsGetUserStatusInCourse,
  talentLmsGetUsersProgressInUnit,
  talentLmsIsUnitCompletedInPayload,
  type TalentLmsUserCourseStatusPayload,
  type TalentLmsUnitUserProgressRow,
} from "@/lib/talentlms/api-enroll";

export type TalentLessonProgressSnapshot =
  | {
      kind: "ready";
      percent: number;
      talentUrl: string | null;
      courseId: string;
      unitId: string;
      statusLabel: string | null;
      checkedAt: string;
      detailNote: string | null;
    }
  | {
      kind: "unavailable";
      talentUrl: string | null;
      message: string;
    }
  | {
      kind: "error";
      message: string;
      talentUrl: string | null;
    };

function parsePercentFromUnitProgressRow(
  row: TalentLmsUnitUserProgressRow | undefined
): number {
  if (!row) {
    return 0;
  }
  const st = String(row.status ?? "").toLowerCase();
  if (st === "completed") {
    return 100;
  }
  const raw = String(row.score ?? "").replace(/%/g, "").trim();
  const n = parseFloat(raw);
  if (!Number.isNaN(n)) {
    return Math.min(100, Math.max(0, n));
  }
  if (st.includes("progress")) {
    return 1;
  }
  return 0;
}

function unitPercentFromCoursePayload(
  payload: TalentLmsUserCourseStatusPayload,
  unitId: string
): { percent: number; statusLabel: string | null } {
  const verdict = talentLmsIsUnitCompletedInPayload(payload, unitId);
  const unitRow = payload.units?.find(
    (u) => String(u.id ?? "") === String(unitId)
  );

  if (verdict.completed) {
    return { percent: 100, statusLabel: unitRow?.completion_status ?? "Completed" };
  }

  const rawPct = unitRow?.completion_percentage;
  if (rawPct != null && rawPct !== "") {
    const n =
      typeof rawPct === "number"
        ? rawPct
        : parseFloat(String(rawPct).replace(/%/g, "").trim());
    if (!Number.isNaN(n)) {
      return {
        percent: Math.min(100, Math.max(0, n)),
        statusLabel: unitRow?.completion_status ?? null,
      };
    }
  }

  return {
    percent: 0,
    statusLabel: unitRow?.completion_status ?? null,
  };
}

export type TalentLessonUnitKind = "lesson" | "test";

function talentProgressUserGoneMessage(): string {
  return "Talent LMS has no active learner for your Hangar email (deleted or deactivated — common after a plan change). Ask a Talent admin to restore that user, or open the lesson once so Hangar can recreate it, then refresh.";
}

/**
 * Progress for the learner’s weekly lesson — unit id from `lessons.talent_lms_unit_id`
 * (or `talent_lms_test_unit_id` when `unitKind` is `"test"`);
 * Talent LMS course id from the Hangar **`courses`** row for that lesson (via module).
 *
 * Play URL: `https://{TALENTLMS_SUBDOMAIN}.talentlms.com/plus/my/training/{course}/units/{unit}`.
 */
export async function fetchTalentLessonProgressSnapshot(
  supabase: SupabaseClient,
  options: Readonly<{
    userEmail: string | null | undefined;
    /** Extra emails to try (e.g. `public.users.email` when it differs from Auth). */
    additionalEmails?: readonly (string | null | undefined)[];
    /** Used only if Hangar must JIT-create the Talent learner. */
    fullName?: string | null;
    lessonId: string;
    unitKind?: TalentLessonUnitKind;
  }>
): Promise<TalentLessonProgressSnapshot> {
  const resolved = await resolveTalentLmsCourseAndUnitForLesson(
    supabase,
    options.lessonId
  );
  const unitKind = options.unitKind ?? "lesson";
  const effectiveCourseId = resolved.courseId;
  const unitId = unitKind === "test" ? resolved.testUnitId : resolved.unitId;

  const subdomain = process.env.TALENTLMS_SUBDOMAIN?.trim() ?? "";

  const talentUrl =
    unitId && effectiveCourseId && subdomain
      ? buildTalentLmsCoursePlayUrl({
          subdomain,
          courseId: effectiveCourseId,
          unitId,
        })
      : null;

  const apiConfig = getTalentLmsApiEnrollmentConfig();
  const checkedAt = new Date().toISOString();

  if (!unitId) {
    return {
      kind: "unavailable",
      talentUrl,
      message:
        unitKind === "test"
          ? "No TalentLMS test specified."
          : "No TalentLMS lesson specified.",
    };
  }

  if (!effectiveCourseId) {
    return {
      kind: "unavailable",
      talentUrl,
      message:
        "Set the Talent LMS course ID on this Hangar course so unit progress can load.",
    };
  }

  if (!subdomain) {
    return {
      kind: "unavailable",
      talentUrl: null,
      message:
        "TALENTLMS_SUBDOMAIN is not set on the server; Hangar cannot build your lesson link.",
    };
  }

  if (!apiConfig) {
    return {
      kind: "unavailable",
      talentUrl,
      message:
        "Connect Talent LMS on the server (TALENTLMS_SUBDOMAIN and TALENTLMS_API_KEY) to load progress.",
    };
  }

  const lookupEmails = [
    options.userEmail,
    ...(options.additionalEmails ?? []),
  ].filter((e): e is string => typeof e === "string" && e.trim().length > 0);

  if (lookupEmails.length === 0) {
    return {
      kind: "error",
      message: "Your account has no email; Talent progress cannot load.",
      talentUrl,
    };
  }

  const enroll = await ensureTalentLmsUserAndEnrollInCourse({
    config: apiConfig,
    userEmail: lookupEmails[0],
    fullName: options.fullName,
    courseId: effectiveCourseId,
  });
  if (!enroll.ok) {
    console.error(
      "[TalentLMS] progress-time enroll failed:",
      enroll.status,
      enroll.message
    );
  }

  const tlUser = await talentLmsResolveLearnerUserIdFromEmails(
    apiConfig,
    lookupEmails
  );
  if (!tlUser.ok) {
    return {
      kind: "error",
      message:
        talentLmsIsRequestedUserGone(tlUser.message)
          ? talentProgressUserGoneMessage()
          : tlUser.status === 404
            ? "Talent LMS API could not match your Hangar account to a learner. Hangar expects the Talent learner login to match your Hangar email (same value in Supabase Auth and public.users). If you use SSO, ensure TALENTLMS_SAML_USERNAME_MODE matches how Talent stores login (usually full email)."
            : tlUser.message,
      talentUrl,
    };
  }

  const up = await talentLmsGetUsersProgressInUnit({
    config: apiConfig,
    unitId,
    userId: tlUser.userId,
  });

  if (up.ok && up.entries.length > 0) {
    const row =
      up.entries.find(
        (e) => String(e.user_id ?? "") === String(tlUser.userId)
      ) ?? up.entries[0];

    return {
      kind: "ready",
      percent: parsePercentFromUnitProgressRow(row),
      talentUrl,
      courseId: effectiveCourseId,
      unitId,
      statusLabel: row.status ?? null,
      checkedAt,
      detailNote: null,
    };
  }

  const courseStatus = await talentLmsGetUserStatusInCourse({
    config: apiConfig,
    userId: tlUser.userId,
    courseId: effectiveCourseId,
  });

  if (!courseStatus.ok) {
    return {
      kind: "error",
      message: talentLmsIsRequestedUserGone(courseStatus.message)
        ? talentProgressUserGoneMessage()
        : courseStatus.message,
      talentUrl,
    };
  }

  const { percent, statusLabel } = unitPercentFromCoursePayload(
    courseStatus.payload,
    unitId
  );

  return {
    kind: "ready",
    percent,
    talentUrl,
    courseId: effectiveCourseId,
    unitId,
    statusLabel,
    checkedAt,
    detailNote:
      up.ok && up.entries.length === 0
        ? "No unit activity reported yet; showing enrollment status from your course."
        : null,
  };
}

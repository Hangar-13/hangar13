import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTalentLmsCoursePlayUrl,
  coerceTalentLmsUnitId,
} from "@/lib/talentlms/lesson-url";
import {
  getTalentLmsApiEnrollmentConfig,
  talentLmsGetUserIdByEmail,
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

/**
 * Progress for the learner’s weekly lesson — uses **only** `lessons.talent_lms_unit_id`
 * and `training_paths.talent_lms_course_id` (plus `TALENTLMS_SUBDOMAIN` for the play URL).
 */
export async function fetchTalentLessonProgressSnapshot(
  supabase: SupabaseClient,
  options: Readonly<{
    userEmail: string | null | undefined;
    lessonId: string;
    trainingPathId: string;
  }>
): Promise<TalentLessonProgressSnapshot> {
  const [{ data: lessonRow }, { data: pathRow }] = await Promise.all([
    supabase
      .from("lessons")
      .select("talent_lms_unit_id")
      .eq("id", options.lessonId)
      .maybeSingle(),
    supabase
      .from("training_paths")
      .select("talent_lms_course_id")
      .eq("id", options.trainingPathId)
      .maybeSingle(),
  ]);

  const unitId = coerceTalentLmsUnitId(
    typeof lessonRow?.talent_lms_unit_id === "string"
      ? lessonRow.talent_lms_unit_id
      : null
  );

  const courseIdRaw =
    typeof pathRow?.talent_lms_course_id === "string" &&
    pathRow.talent_lms_course_id.trim()
      ? pathRow.talent_lms_course_id.trim()
      : null;

  const subdomain = process.env.TALENTLMS_SUBDOMAIN?.trim() ?? "";

  const apiConfig = getTalentLmsApiEnrollmentConfig();
  const checkedAt = new Date().toISOString();

  if (!unitId) {
    return {
      kind: "unavailable",
      talentUrl: null,
      message: "No TalentLMS lesson specified.",
    };
  }

  if (!courseIdRaw) {
    return {
      kind: "unavailable",
      talentUrl: null,
      message:
        "Set the Talent LMS course id on this training path so Hangar can load unit progress.",
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

  const talentUrl = buildTalentLmsCoursePlayUrl({
    subdomain,
    courseId: courseIdRaw,
    unitId,
  });

  if (!apiConfig) {
    return {
      kind: "unavailable",
      talentUrl,
      message:
        "Connect Talent LMS on the server (TALENTLMS_SUBDOMAIN and TALENTLMS_API_KEY) to load progress.",
    };
  }

  const email = options.userEmail?.trim().toLowerCase();
  if (!email) {
    return {
      kind: "error",
      message: "Your account has no email; Talent progress cannot load.",
      talentUrl,
    };
  }

  const tlUser = await talentLmsGetUserIdByEmail(apiConfig, email);
  if (!tlUser.ok) {
    return {
      kind: "error",
      message:
        tlUser.status === 404
          ? "No Talent LMS learner matches your email yet. Open your lesson in Talent once, then update progress."
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
      courseId: courseIdRaw,
      unitId,
      statusLabel: row.status ?? null,
      checkedAt,
      detailNote: null,
    };
  }

  const courseStatus = await talentLmsGetUserStatusInCourse({
    config: apiConfig,
    userId: tlUser.userId,
    courseId: courseIdRaw,
  });

  if (!courseStatus.ok) {
    return {
      kind: "error",
      message: courseStatus.message,
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
    courseId: courseIdRaw,
    unitId,
    statusLabel,
    checkedAt,
    detailNote:
      up.ok && up.entries.length === 0
        ? "No unit activity reported yet; showing enrollment status from your course."
        : null,
  };
}

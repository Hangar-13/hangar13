import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getTalentLmsApiEnrollmentConfig,
  talentLmsGetUserIdByEmail,
  talentLmsGetUserStatusInCourse,
  talentLmsGetUsersProgressInUnit,
  talentLmsIsUnitCompletedInPayload,
  type TalentLmsUserCourseStatusPayload,
  type TalentLmsUnitUserProgressRow,
} from "@/lib/talentlms/api-enroll";
import { getLessonTalentContext } from "@/lib/talentlms/lesson-talent-context";

export type TalentLessonProgressSnapshot =
  | {
      kind: "ready";
      percent: number;
      talentUrl: string | null;
      courseId: string;
      unitId: string | null;
      granularity: "unit" | "course";
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

function parseCourseCompletionPercent(
  payload: TalentLmsUserCourseStatusPayload
): number {
  const raw = payload.completion_percentage;
  if (raw == null || raw === "") {
    return 0;
  }
  const n =
    typeof raw === "number"
      ? raw
      : parseFloat(String(raw).replace(/%/g, "").trim());
  return Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
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

export async function fetchTalentLessonProgressSnapshot(
  supabase: SupabaseClient,
  options: Readonly<{
    userEmail: string | null | undefined;
    lessonId: string;
    trainingPathId: string;
  }>
): Promise<TalentLessonProgressSnapshot> {
  const ctx = await getLessonTalentContext(
    supabase,
    options.lessonId,
    options.trainingPathId
  );

  const apiConfig = getTalentLmsApiEnrollmentConfig();
  const checkedAt = new Date().toISOString();

  if (!apiConfig) {
    return {
      kind: "unavailable",
      talentUrl: ctx.talentUrl,
      message:
        "Connect Talent LMS on the server (TALENTLMS_SUBDOMAIN and TALENTLMS_API_KEY) to load progress.",
    };
  }

  if (!ctx.courseId) {
    return {
      kind: "unavailable",
      talentUrl: ctx.talentUrl,
      message:
        "Set a Talent course on this lesson link or on the training path, then tap Update progress.",
    };
  }

  const email = options.userEmail?.trim().toLowerCase();
  if (!email) {
    return {
      kind: "error",
      message: "Your account has no email; Talent progress cannot load.",
      talentUrl: ctx.talentUrl,
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
      talentUrl: ctx.talentUrl,
    };
  }

  if (ctx.unitId) {
    const up = await talentLmsGetUsersProgressInUnit({
      config: apiConfig,
      unitId: ctx.unitId,
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
        talentUrl: ctx.talentUrl,
        courseId: ctx.courseId,
        unitId: ctx.unitId,
        granularity: "unit",
        statusLabel: row.status ?? null,
        checkedAt,
        detailNote: null,
      };
    }

    const courseStatus = await talentLmsGetUserStatusInCourse({
      config: apiConfig,
      userId: tlUser.userId,
      courseId: ctx.courseId,
    });

    if (!courseStatus.ok) {
      return {
        kind: "error",
        message: courseStatus.message,
        talentUrl: ctx.talentUrl,
      };
    }

    const { percent, statusLabel } = unitPercentFromCoursePayload(
      courseStatus.payload,
      ctx.unitId
    );

    return {
      kind: "ready",
      percent,
      talentUrl: ctx.talentUrl,
      courseId: ctx.courseId,
      unitId: ctx.unitId,
      granularity: "unit",
      statusLabel,
      checkedAt,
      detailNote:
        up.ok && up.entries.length === 0
          ? "No unit activity reported yet; showing enrollment status from your course."
          : null,
    };
  }

  const courseStatus = await talentLmsGetUserStatusInCourse({
    config: apiConfig,
    userId: tlUser.userId,
    courseId: ctx.courseId,
  });

  if (!courseStatus.ok) {
    return {
      kind: "error",
      message: courseStatus.message,
      talentUrl: ctx.talentUrl,
    };
  }

  return {
    kind: "ready",
    percent: parseCourseCompletionPercent(courseStatus.payload),
    talentUrl: ctx.talentUrl,
    courseId: ctx.courseId,
    unitId: null,
    granularity: "course",
    statusLabel: courseStatus.payload.completion_status ?? null,
    checkedAt,
    detailNote:
      "Overall course completion. Use a Talent URL that includes a unit id for this lesson’s unit progress.",
  };
}

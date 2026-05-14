/** URL points at any *.talentlms.com host (including www / apex). */
export function isTalentLmsHttpsUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "talentlms.com" || host.endsWith(".talentlms.com");
  } catch {
    return false;
  }
}

/** Tenant learner portal — excludes www.talentlms.com and talentlms.com (marketing hosts). */
export function isTalentLmsTenantPortalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "talentlms.com" || h === "www.talentlms.com") return false;
  return h.endsWith(".talentlms.com");
}

export function isTalentLmsTenantPortalHttpsUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return isTalentLmsTenantPortalHostname(u.hostname);
  } catch {
    return false;
  }
}

/** Normalizes stored unit id from DB; null if empty or invalid. */
export function coerceTalentLmsUnitId(
  raw: string | null | undefined
): string | null {
  const t = raw?.trim();
  if (!t || !/^\d+$/.test(t)) return null;
  return t;
}

/** Normalizes Talent LMS course id from DB; null if empty or invalid. */
export function coerceTalentLmsCourseId(
  raw: string | null | undefined
): string | null {
  const t = raw?.trim();
  if (!t || !/^\d+$/.test(t)) return null;
  return t;
}

/** Validates manager-supplied Talent unit id; empty clears the field. */
export function validateTalentLmsUnitIdForSave(
  raw: string | null | undefined
):
  | { ok: true; unitId: string | null }
  | { ok: false; error: string } {
  const t = raw?.trim();
  if (!t) return { ok: true, unitId: null };
  if (!/^\d+$/.test(t)) {
    return {
      ok: false,
      error: "TalentLMS Unit must contain digits only.",
    };
  }
  if (t.length > 24) {
    return { ok: false, error: "TalentLMS Unit id is too long." };
  }
  return { ok: true, unitId: t };
}

/** Validates manager-supplied Talent LMS course id for Hangar courses. */
export function validateTalentLmsCourseIdForSave(
  raw: string | null | undefined
):
  | { ok: true; courseId: string | null }
  | { ok: false; error: string } {
  const t = raw?.trim();
  if (!t) return { ok: true, courseId: null };
  if (!/^\d+$/.test(t)) {
    return {
      ok: false,
      error: "Talent LMS course ID must be numeric (digits only), e.g. 126.",
    };
  }
  if (t.length > 24) {
    return { ok: false, error: "Talent LMS course ID is too long." };
  }
  return { ok: true, courseId: t };
}

/**
 * Learner deep link: `/course/play/id:{courseId}/unit:{unitId}` on the tenant host.
 */
export function buildTalentLmsCoursePlayUrl(options: Readonly<{
  subdomain: string;
  courseId: string;
  unitId: string;
}>): string {
  const sub = options.subdomain.trim().toLowerCase();
  const cid = options.courseId.trim();
  const uid = options.unitId.trim();
  return `https://${sub}.talentlms.com/course/play/id:${cid}/unit:${uid}`;
}

/**
 * First Talent LMS URL in markdown — prefers tenant portal URLs over www / apex links.
 * Used for “Start lesson” (deep link as authored).
 */
export function extractFirstTalentLmsUrlFromMarkdown(markdown: string): string | null {
  if (!markdown.trim()) return null;

  const candidates: string[] = [];

  const mdLinkPattern =
    /\]\(\s*(https?:\/\/[^)\s]+\.talentlms\.com[^)\s]*)\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdLinkPattern.exec(markdown)) !== null) {
    pushTalentCandidate(candidates, sanitizeMarkdownUrlTail(m[1]));
  }

  const rawPattern = /https?:\/\/[^\s\]"'`<>()]+\.talentlms\.com[^\s\]"'`<>()]*/gi;
  while ((m = rawPattern.exec(markdown)) !== null) {
    pushTalentCandidate(candidates, sanitizeMarkdownUrlTail(m[0]));
  }

  const tenantHit = candidates.find((c) => isTalentLmsTenantPortalHttpsUrl(c));
  return tenantHit ?? candidates[0] ?? null;
}

function pushTalentCandidate(bucket: string[], raw: string): void {
  if (!raw.trim()) return;
  try {
    bucket.push(new URL(raw).href);
  } catch {
    /* skip */
  }
}

function sanitizeMarkdownUrlTail(s: string): string {
  return s.replace(/[.,;]+$/, "").replace(/\)+$/, "");
}

/**
 * Extract Talent course and unit ids from a learner URL (markdown links often use
 * `/course/play/id:{courseId}/unit:{unitId}` or query params).
 */
export function parseTalentLmsCourseAndUnitFromUrl(href: string): {
  courseId: string | null;
  unitId: string | null;
} {
  try {
    const u = new URL(href);
    const pathLower = u.pathname.toLowerCase();
    const combined = `${u.pathname}${u.search}`;

    let courseId: string | null = null;
    let unitId: string | null = null;

    const unitColon = combined.match(/(?:^|[/?#,])unit:(\d+)/);
    if (unitColon) {
      unitId = unitColon[1];
    }

    if (pathLower.includes("/course/play/")) {
      const playCourse = combined.match(/\/course\/play\/id:(\d+)/i);
      if (playCourse) {
        courseId = playCourse[1];
      }
    }

    if (!courseId) {
      const courseKw = combined.match(/course_id:(\d+)/i);
      if (courseKw) {
        courseId = courseKw[1];
      }
    }

    if (!courseId) {
      const idColon = combined.match(/(?:^|[/?#,])id:(\d+)/);
      if (
        idColon &&
        !pathLower.includes("/certificate/") &&
        !pathLower.includes("/download/")
      ) {
        courseId = idColon[1];
      }
    }

    const qpCourse =
      u.searchParams.get("course_id") ?? u.searchParams.get("courseId");
    if (qpCourse && /^\d+$/.test(qpCourse.trim())) {
      courseId = qpCourse.trim();
    }

    const qpUnit =
      u.searchParams.get("unit_id") ?? u.searchParams.get("unitId");
    if (qpUnit && /^\d+$/.test(qpUnit.trim())) {
      unitId = qpUnit.trim();
    }

    return { courseId, unitId };
  } catch {
    return { courseId: null, unitId: null };
  }
}

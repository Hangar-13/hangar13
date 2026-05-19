/**
 * TalentLMS REST — ensure learner exists and enroll in a course after Hangar path enrollment.
 * @see https://www.talentlms.com/pages/docs/TalentLMS-API-Documentation.pdf
 */

import { randomBytes } from "node:crypto";

import { getTalentLmsUsernamePolicyFromEnv } from "@/lib/talentlms/saml-config";
import {
  resolveTalentLmsUsername,
  splitFullName,
} from "@/lib/talentlms/talentlms-saml";

export type TalentLmsApiConfig = Readonly<{
  subdomain: string;
  apiKey: string;
}>;

/** Subdomain from SAML config; API key optional (feature off when unset). */
export function getTalentLmsApiEnrollmentConfig():
  | TalentLmsApiConfig
  | null {
  const subdomain = process.env.TALENTLMS_SUBDOMAIN?.trim();
  const apiKey = process.env.TALENTLMS_API_KEY?.trim();
  if (!subdomain || !apiKey) return null;
  return { subdomain, apiKey };
}

export type TalentLmsEnrollResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function basicAuthHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function readTalentApiErrorMessage(res: Response): Promise<string> {
  let message = `HTTP ${res.status}`;
  try {
    const raw = (await res.json()) as unknown;
    if (raw && typeof raw === "object" && "message" in raw) {
      const m = (raw as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) message = m.trim();
    }
  } catch {
    // ignore
  }
  return message;
}

function baseUrl(config: TalentLmsApiConfig): string {
  return `https://${config.subdomain}.talentlms.com/api/v1`;
}

/**
 * Path segment value for `/users/email:{value}` and `/users/username:{value}`.
 * We still encode dangerous characters, but restore `@` after encoding — some Talent LMS
 * portals route these URLs using a literal `@`; `%40` can incorrectly return 404 while
 * `GET /users/id:{id}` shows the same email/login (verified against hangar13.talentlms.com).
 */
function talentUserLookupPathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, "@");
}

/**
 * Enrolls by email. Idempotent for “already enrolled”.
 */
export async function talentLmsApiAddUserToCourse(options: Readonly<{
  config: TalentLmsApiConfig;
  userEmail: string;
  courseId: string;
}>): Promise<TalentLmsEnrollResult> {
  const email = options.userEmail.trim().toLowerCase();
  if (!email) {
    return { ok: false, status: 400, message: "Missing user email." };
  }

  const url = `${baseUrl(options.config)}/addusertocourse`;

  const body = new URLSearchParams({
    user_email: email,
    course_id: options.courseId.trim(),
    role: "learner",
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(options.config.apiKey),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "TalentLMS API request failed.";
    return { ok: false, status: 0, message: msg };
  }

  if (res.ok) {
    return { ok: true };
  }

  const message = await readTalentApiErrorMessage(res);

  const lower = message.toLowerCase();
  if (
    lower.includes("already") &&
    (lower.includes("enrolled") || lower.includes("assign"))
  ) {
    return { ok: true };
  }

  return { ok: false, status: res.status, message };
}

/**
 * GET /users/email:… — Talent user id for progress APIs (e.g. getuserstatusincourse).
 */
export async function talentLmsGetUserIdByEmail(
  config: TalentLmsApiConfig,
  email: string
): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const norm = email.trim().toLowerCase();
  if (!norm) {
    return { ok: false, status: 400, message: "Missing user email." };
  }

  const url = `${baseUrl(config)}/users/email:${talentUserLookupPathSegment(norm)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(config.apiKey),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "TalentLMS API request failed.";
    return { ok: false, status: 0, message: msg };
  }

  if (res.status === 404) {
    return { ok: false, status: 404, message: "Talent LMS user not found for this email." };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: await readTalentApiErrorMessage(res),
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, status: 500, message: "Invalid Talent LMS user response." };
  }

  const id =
    body &&
    typeof body === "object" &&
    "id" in body &&
    String((body as { id: unknown }).id).trim()
      ? String((body as { id: unknown }).id).trim()
      : "";

  if (!id) {
    return { ok: false, status: 500, message: "Talent LMS user response missing id." };
  }

  return { ok: true, userId: id };
}

/**
 * GET /users/username:… — matches SAML `login` when Talent stores no email match.
 * @see TalentLMS API PDF — `/v1/users/username:{userName}`
 */
export async function talentLmsGetUserIdByUsername(
  config: TalentLmsApiConfig,
  username: string
): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const login = username.trim();
  if (!login) {
    return { ok: false, status: 400, message: "Missing Talent LMS username." };
  }

  const url = `${baseUrl(config)}/users/username:${talentUserLookupPathSegment(login)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(config.apiKey),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "TalentLMS API request failed.";
    return { ok: false, status: 0, message: msg };
  }

  if (res.status === 404) {
    return {
      ok: false,
      status: 404,
      message: "Talent LMS user not found for this username.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: await readTalentApiErrorMessage(res),
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, status: 500, message: "Invalid Talent LMS user response." };
  }

  const id =
    body &&
    typeof body === "object" &&
    "id" in body &&
    String((body as { id: unknown }).id).trim()
      ? String((body as { id: unknown }).id).trim()
      : "";

  if (!id) {
    return { ok: false, status: 500, message: "Talent LMS user response missing id." };
  }

  return { ok: true, userId: id };
}

/**
 * Resolves Talent `user_id` for a Hangar learner:
 * 1. GET `/users/email:{email}`
 * 2. On 404, GET `/users/username:{login}` for candidates in order:
 *    full email (lowercase), full email (original casing if different), SAML-policy login,
 *    then email local part — Talent often sets **username** to the full email while the
 *    profile **email** field is empty, so `/users/email` 404s but `/users/username` works.
 */
export async function talentLmsResolveLearnerUserId(
  config: TalentLmsApiConfig,
  email: string
): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const norm = email.trim().toLowerCase();
  if (!norm) {
    return { ok: false, status: 400, message: "Missing user email." };
  }

  const byEmail = await talentLmsGetUserIdByEmail(config, norm);
  if (byEmail.ok) {
    return byEmail;
  }
  if (byEmail.status !== 404) {
    return byEmail;
  }

  const rawTrimmed = email.trim();
  const usernameTries: string[] = [];
  const seenLogin = new Set<string>();

  function pushLogin(candidate: string): void {
    const t = candidate.trim();
    if (!t || seenLogin.has(t)) return;
    seenLogin.add(t);
    usernameTries.push(t);
  }

  pushLogin(norm);
  if (rawTrimmed !== norm) {
    pushLogin(rawTrimmed);
  }

  const policy = getTalentLmsUsernamePolicyFromEnv();
  const fromPolicy = resolveTalentLmsUsername(norm, policy);
  if (fromPolicy !== norm) {
    pushLogin(fromPolicy);
  }

  const at = norm.indexOf("@");
  if (at > 0) {
    const local = norm.slice(0, at).trim();
    if (local) {
      pushLogin(local);
    }
  }

  for (const login of usernameTries) {
    const byUsername = await talentLmsGetUserIdByUsername(config, login);
    if (byUsername.ok) {
      return byUsername;
    }
    if (byUsername.status !== 404) {
      return byUsername;
    }
  }

  return byEmail;
}

/**
 * Tries {@link talentLmsResolveLearnerUserId} for each distinct email (e.g. Supabase Auth vs `users.email`)
 * until one succeeds or a non-404 error is returned.
 */
export async function talentLmsResolveLearnerUserIdFromEmails(
  config: TalentLmsApiConfig,
  emails: readonly (string | null | undefined)[]
): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const seen = new Set<string>();
  let last404:
    | { ok: false; status: number; message: string }
    | null = null;

  for (const raw of emails) {
    const norm = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);

    const r = await talentLmsResolveLearnerUserId(config, norm);
    if (r.ok) {
      return r;
    }
    if (r.status === 404) {
      last404 = r;
      continue;
    }
    return r;
  }

  return (
    last404 ?? {
      ok: false,
      status: 404,
      message: "Talent LMS user not found for this email.",
    }
  );
}

/** GET /users/email:… — returns whether a learner row exists. */
async function talentLmsUserExistsByEmail(
  config: TalentLmsApiConfig,
  email: string
): Promise<
  { ok: true; exists: boolean } | { ok: false; status: number; message: string }
> {
  const got = await talentLmsGetUserIdByEmail(config, email);
  if (got.ok) {
    return { ok: true, exists: true };
  }
  if (got.status === 404) {
    return { ok: true, exists: false };
  }
  return { ok: false, status: got.status, message: got.message };
}

export type TalentLmsUserCourseStatusPayload = {
  completion_status?: string;
  completion_percentage?: string | number;
  units?: Array<{
    id?: string;
    name?: string;
    completion_status?: string;
    completed_on?: string;
    completion_percentage?: string | number;
  }>;
};

export type TalentLmsUnitUserProgressRow = {
  user_id?: string;
  status?: string;
  score?: string;
};

/**
 * GET /getusersprogressinunits/unit_id:{unitId},user_id:{userId}
 * @see TalentLMS API PDF — Units → getUsersProgress
 */
export async function talentLmsGetUsersProgressInUnit(options: Readonly<{
  config: TalentLmsApiConfig;
  unitId: string;
  userId: string;
}>): Promise<
  | { ok: true; entries: TalentLmsUnitUserProgressRow[] }
  | { ok: false; status: number; message: string }
> {
  const unitId = options.unitId.trim();
  const userId = options.userId.trim();
  if (!unitId || !userId) {
    return { ok: false, status: 400, message: "Missing unit or user id." };
  }

  const url = `${baseUrl(options.config)}/getusersprogressinunits/unit_id:${unitId},user_id:${userId}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(options.config.apiKey),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "TalentLMS API request failed.";
    return { ok: false, status: 0, message: msg };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: await readTalentApiErrorMessage(res),
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return {
      ok: false,
      status: 500,
      message: "Invalid Talent LMS unit progress response.",
    };
  }

  const entries: TalentLmsUnitUserProgressRow[] = Array.isArray(payload)
    ? (payload as TalentLmsUnitUserProgressRow[])
    : [];

  return { ok: true, entries };
}

/**
 * GET /getuserstatusincourse/course_id:{courseId},user_id:{userId}
 * @see TalentLMS API PDF — "Get user status in course"
 */
export async function talentLmsGetUserStatusInCourse(options: Readonly<{
  config: TalentLmsApiConfig;
  userId: string;
  courseId: string;
}>): Promise<
  | { ok: true; payload: TalentLmsUserCourseStatusPayload }
  | { ok: false; status: number; message: string }
> {
  const courseId = options.courseId.trim();
  const userId = options.userId.trim();
  if (!courseId || !userId) {
    return { ok: false, status: 400, message: "Missing course or user id." };
  }

  const url = `${baseUrl(options.config)}/getuserstatusincourse/course_id:${courseId},user_id:${userId}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(options.config.apiKey),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "TalentLMS API request failed.";
    return { ok: false, status: 0, message: msg };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: await readTalentApiErrorMessage(res),
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return {
      ok: false,
      status: 500,
      message: "Invalid Talent LMS course status response.",
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      status: 500,
      message: "Invalid Talent LMS course status response.",
    };
  }

  return { ok: true, payload: payload as TalentLmsUserCourseStatusPayload };
}

/** Whether the given unit id is marked Completed in a getuserstatusincourse payload. */
export function talentLmsIsUnitCompletedInPayload(
  payload: TalentLmsUserCourseStatusPayload,
  unitId: string
): { found: boolean; completed: boolean } {
  const units = payload.units;
  if (!Array.isArray(units) || units.length === 0) {
    return { found: false, completed: false };
  }

  const match = units.find((u) => String(u.id ?? "") === String(unitId));
  if (!match) {
    return { found: false, completed: false };
  }

  const done =
    String(match.completion_status ?? "").toLowerCase() === "completed";
  return { found: true, completed: done };
}

/** POST /usersignup — password is unused when learners use SSO only. */
async function talentLmsApiSignupUser(options: Readonly<{
  config: TalentLmsApiConfig;
  email: string;
  login: string;
  firstName: string;
  lastName: string;
}>): Promise<TalentLmsEnrollResult> {
  const password = randomBytes(24).toString("base64url");

  const url = `${baseUrl(options.config)}/usersignup`;
  const body = new URLSearchParams({
    first_name: options.firstName || "User",
    last_name: options.lastName.trim() ? options.lastName : "-",
    email: options.email,
    login: options.login,
    password,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(options.config.apiKey),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "TalentLMS API request failed.";
    return { ok: false, status: 0, message: msg };
  }

  if (res.ok) {
    return { ok: true };
  }

  const message = await readTalentApiErrorMessage(res);
  const lower = message.toLowerCase();
  if (
    lower.includes("already") ||
    lower.includes("exist") ||
    lower.includes("registered") ||
    lower.includes("duplicate") ||
    lower.includes("taken")
  ) {
    return { ok: true };
  }

  return { ok: false, status: res.status, message };
}

/**
 * Ensure the email has a Talent user (JIT signup), then enroll in the course.
 * `login` matches SAML username rules so first SSO matches the same account.
 */
export async function ensureTalentLmsUserAndEnrollInCourse(options: Readonly<{
  config: TalentLmsApiConfig;
  userEmail: string;
  /** From Hangar `users.full_name` — used only when creating the Talent user. */
  fullName: string | null | undefined;
  courseId: string;
}>): Promise<TalentLmsEnrollResult> {
  const email = options.userEmail.trim().toLowerCase();
  if (!email) {
    return { ok: false, status: 400, message: "Missing user email." };
  }

  const exists = await talentLmsUserExistsByEmail(options.config, email);
  if (!exists.ok) {
    return { ok: false, status: exists.status, message: exists.message };
  }

  if (!exists.exists) {
    const policy = getTalentLmsUsernamePolicyFromEnv();
    const login = resolveTalentLmsUsername(email, policy);
    const { first, last } = splitFullName(options.fullName);
    const sign = await talentLmsApiSignupUser({
      config: options.config,
      email,
      login,
      firstName: first,
      lastName: last,
    });
    if (!sign.ok) {
      return sign;
    }
  }

  return talentLmsApiAddUserToCourse({
    config: options.config,
    userEmail: email,
    courseId: options.courseId,
  });
}

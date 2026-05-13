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

/** GET /users/email:… — returns whether a learner row exists. */
async function talentLmsUserExistsByEmail(
  config: TalentLmsApiConfig,
  email: string
): Promise<
  { ok: true; exists: boolean } | { ok: false; status: number; message: string }
> {
  const url = `${baseUrl(config)}/users/email:${encodeURIComponent(email)}`;
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

  if (res.ok) {
    return { ok: true, exists: true };
  }
  if (res.status === 404) {
    return { ok: true, exists: false };
  }
  return {
    ok: false,
    status: res.status,
    message: await readTalentApiErrorMessage(res),
  };
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

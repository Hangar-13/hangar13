#!/usr/bin/env node
/**
 * Local Talent LMS REST probe — same auth + paths as lib/talentlms/api-enroll.ts
 * (GET /users/email:… then /users/username:… fallbacks). Optional GET /users/id:…
 * for debugging when Admin shows a numeric user id but email/username return 404.
 *
 * Usage:
 *   npm run talent:probe -- learner@example.com
 *   npm run talent:probe -- --env-file=.env.live.local learner@example.com
 *   npm run talent:probe -- --env-file=.env.live.local --user-id=4 learner@example.com
 *   npm run talent:probe -- --user-id=4
 *
 * Loads env: optional --env-file=PATH (last wins), then .env then .env.local (local overrides).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import dotenv from "dotenv";

function loadEnv() {
  const root = process.cwd();
  const envFileArg = process.argv.find((a) => a.startsWith("--env-file="));
  const explicit = envFileArg?.slice("--env-file=".length)?.trim();
  if (explicit) {
    const p = resolve(root, explicit);
    if (!existsSync(p)) {
      console.error(`Missing env file: ${p}`);
      process.exit(1);
    }
    dotenv.config({ path: p, override: true });
    return;
  }
  for (const [file, override] of [
    [".env", false],
    [".env.local", true],
  ]) {
    const p = resolve(root, file);
    if (existsSync(p)) {
      dotenv.config({ path: p, override });
    }
  }
}

function parseUserIdFlag() {
  const arg = process.argv.find((a) => a.startsWith("--user-id="));
  if (!arg) return null;
  const v = arg.slice("--user-id=".length).trim();
  return v || null;
}

function basicAuthHeader(apiKey) {
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

/** Match lib/talentlms/api-enroll.ts — literal `@` in email/username path segments for Talent routing. */
function talentUserLookupPathSegment(value) {
  return encodeURIComponent(value).replace(/%40/g, "@");
}

function usernameModeFromEnv() {
  const raw = process.env.TALENTLMS_SAML_USERNAME_MODE?.trim().toLowerCase() ?? "email";
  if (
    raw === "emaillocalpart" ||
    raw === "email_local_part" ||
    raw === "localpart"
  ) {
    return "emailLocalPart";
  }
  return "email";
}

function policyLoginFromEmail(normEmail) {
  if (usernameModeFromEnv() !== "emailLocalPart") {
    return normEmail;
  }
  const at = normEmail.indexOf("@");
  if (at <= 0) return normEmail;
  return normEmail.slice(0, at).trim() || normEmail;
}

function collectUsernameCandidates(rawInput) {
  const trimmed = rawInput.trim();
  const norm = trimmed.toLowerCase();
  const tries = [];
  const seen = new Set();

  function push(s) {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    tries.push(t);
  }

  push(norm);
  if (trimmed !== norm) {
    push(trimmed);
  }
  const fromPolicy = policyLoginFromEmail(norm);
  if (fromPolicy !== norm) {
    push(fromPolicy);
  }
  const at = norm.indexOf("@");
  if (at > 0) {
    const local = norm.slice(0, at).trim();
    if (local) {
      push(local);
    }
  }
  return tries;
}

async function fetchTalent(pathSuffix, authHeader, subdomain) {
  const url = `https://${subdomain}.talentlms.com/api/v1/${pathSuffix}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  return { url, status: res.status, json, textPreview: text.slice(0, 800) };
}

function printResult(label, result) {
  console.log("\n---", label, "---");
  console.log("URL:", result.url);
  console.log("HTTP:", result.status);
  if (result.json && typeof result.json === "object") {
    const id = result.json.id;
    console.log(
      "JSON id:",
      id !== undefined && id !== null ? String(id) : "(missing)"
    );
    console.log("JSON (truncated):", JSON.stringify(result.json).slice(0, 600));
  } else {
    console.log("Body preview:", result.textPreview);
  }
}

async function main() {
  loadEnv();

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const identifier = positional[0]?.trim();
  const numericUserId = parseUserIdFlag();

  if (!identifier && !numericUserId) {
    console.error(`Usage: node scripts/talent-lms-api-probe.mjs [options] <email-or-login>
       node scripts/talent-lms-api-probe.mjs [options] --user-id=<Talent numeric id>

Options:
  --env-file=PATH     Load env from this file (overrides .env / .env.local)
  --user-id=N         Also call GET /users/id:N (Talent docs: same API family as email/username)

Examples:
  npm run talent:probe -- learner@example.com
  npm run talent:probe -- --env-file=.env.live.local learner@example.com
  npm run talent:probe -- --env-file=.env.live.local --user-id=4 learner@example.com
  npm run talent:probe -- --env-file=.env.live.local --user-id=4`);
    process.exit(1);
  }

  const subdomain = process.env.TALENTLMS_SUBDOMAIN?.trim();
  const apiKey = process.env.TALENTLMS_API_KEY?.trim();

  if (!subdomain || !apiKey) {
    console.error(
      "Set TALENTLMS_SUBDOMAIN and TALENTLMS_API_KEY in .env.local (or pass --env-file=)."
    );
    process.exit(1);
  }

  const auth = basicAuthHeader(apiKey);
  const normEmail =
    identifier && identifier.includes("@")
      ? identifier.trim().toLowerCase()
      : identifier
        ? identifier.trim()
        : "";

  console.log("Subdomain:", subdomain);
  console.log(
    "TALENTLMS_SAML_USERNAME_MODE:",
    process.env.TALENTLMS_SAML_USERNAME_MODE?.trim() || "(default email)"
  );
  console.log("Input:", identifier || "(none — id-only probe)");
  console.log(
    "Note: Email/username lookups use a literal @ in the URL path (Talent LMS routing); %40 alone may 404."
  );

  if (numericUserId) {
    const idPath = `users/id:${encodeURIComponent(numericUserId)}`;
    const byId = await fetchTalent(idPath, auth, subdomain);
    printResult(`GET by Talent user id (${numericUserId})`, byId);
    if (byId.status === 200 && byId.json?.id != null) {
      console.log(
        "\n✓ API returned this user by numeric id. Compare JSON login/email fields to what Hangar probes;"
      );
      console.log(
        "  SSO users often have no password — that does not affect these GET lookups."
      );
      if (!identifier) {
        process.exit(0);
      }
    } else if (!identifier) {
      console.log(
        "\n✗ /users/id lookup failed too — check API key, subdomain, or Talent API access."
      );
      process.exit(1);
    }
  }

  if (!identifier) {
    process.exit(1);
  }

  if (identifier.includes("@")) {
    const emailPath = `users/email:${talentUserLookupPathSegment(normEmail)}`;
    const byEmail = await fetchTalent(emailPath, auth, subdomain);
    printResult("GET by email (lowercased)", byEmail);
    if (byEmail.status === 200 && byEmail.json?.id != null) {
      console.log("\n✓ Talent returned a user id for email lookup.");
      process.exit(0);
    }
  } else {
    console.log("\n(No @ in input — skipping /users/email; use full email to test that path.)");
  }

  const userCandidates = identifier.includes("@")
    ? collectUsernameCandidates(identifier)
    : [identifier.trim()].filter(Boolean);

  for (const login of userCandidates) {
    const userPath = `users/username:${talentUserLookupPathSegment(login)}`;
    const byUser = await fetchTalent(userPath, auth, subdomain);
    printResult(`GET by username (${login})`, byUser);
    if (byUser.status === 200 && byUser.json?.id != null) {
      console.log("\n✓ Talent returned a user id for username lookup.");
      process.exit(0);
    }
  }

  console.log(
    "\n✗ No successful learner match with the same tries Hangar uses first (email then username variants)."
  );
  console.log(
    "Fix: confirm subdomain + API key, user exists in this Talent portal, and login/email match probes above."
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

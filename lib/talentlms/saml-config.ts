import {
  assertSigningCertificatePem,
  toNormalizedPkcs1RsaPrivateKeyPem,
} from "@/lib/talentlms/saml-pem";

/** TalentLMS SAML (hangar IdP → TalentLMS SP). */

export type TalentLmsSamlUsernameMode = "email" | "emailLocalPart";

export type TalentLmsSamlEnvironment = Readonly<{
  appOrigin: string;
  spEntityId: string;
  acsUrl: string;
  sloUrl: string;
  /** Issuer URI shown to Talent (Identity provider field) */
  idpEntityId: string;
  signingPrivateKeyPem: string;
  signingCertificatePem: string;
  usernameMode: TalentLmsSamlUsernameMode;
  /** OID or custom names matching Talent LMS SSO attribute mapping */
  attrUsername: string;
  attrFirstName: string;
  attrLastName: string;
  attrEmail: string;
}>;

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v?.trim()) {
    throw new Error(`${key} must be set for TalentLMS SAML`);
  }
  return v.trim();
}

export function parseOptionalOrigin(): string | null {
  const v =
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_SITE_URL;
  const t = v?.trim();
  return t ? t.replace(/\/$/, "") : null;
}

/**
 * Validates env and derives Talent LMS ACS / SLO unless overridden.
 * Call only from server routes/actions.
 */
export function getTalentLmsSamlEnvironment(): TalentLmsSamlEnvironment {
  const appOrigin =
    parseOptionalOrigin() ?? "(set APP_ORIGIN or NEXT_PUBLIC_APP_ORIGIN)";
  if (appOrigin.startsWith("(")) {
    throw new Error(
      "Set APP_ORIGIN (recommended) or NEXT_PUBLIC_APP_ORIGIN to your public HTTPS base URL (no trailing slash)"
    );
  }

  const subdomain = requireEnv("TALENTLMS_SUBDOMAIN");
  const spEntityDefault = `${subdomain}.talentlms.com`;
  const spEntityId = process.env.TALENTLMS_SP_ENTITY_ID?.trim() || spEntityDefault;

  const acsUrlDefault = `https://${subdomain}.talentlms.com/simplesaml/module.php/saml/sp/saml2-acs.php/${spEntityId}`;
  const sloUrlDefault = `https://${subdomain}.talentlms.com/simplesaml/module.php/saml/sp/saml2-logout.php/${spEntityId}`;

  const acsUrl =
    process.env.TALENTLMS_SP_ACS_URL?.trim()?.length ? process.env.TALENTLMS_SP_ACS_URL.trim() : acsUrlDefault;

  const sloUrl =
    process.env.TALENTLMS_SP_SLO_URL?.trim()?.length ? process.env.TALENTLMS_SP_SLO_URL.trim() : sloUrlDefault;

  const idDefault = `${appOrigin}/api/auth/saml/talentlms/metadata`;
  const idpEntityId =
    process.env.TALENTLMS_IDP_ENTITY_ID?.trim()?.length ? process.env.TALENTLMS_IDP_ENTITY_ID.trim() : idDefault;

  const signingPrivateKeyPem = toNormalizedPkcs1RsaPrivateKeyPem(
    requireEnv("TALENTLMS_IDP_SIGNING_PRIVATE_KEY")
  );

  const signingCertificatePem = assertSigningCertificatePem(
    requireEnv("TALENTLMS_IDP_SIGNING_CERTIFICATE")
  );

  const modeRaw =
    process.env.TALENTLMS_SAML_USERNAME_MODE?.trim().toLowerCase() ?? "email";
  const usernameMode: TalentLmsSamlUsernameMode =
    modeRaw === "emaillocalpart" ||
    modeRaw === "email_local_part" ||
    modeRaw === "localpart"
      ? "emailLocalPart"
      : "email";

  return {
    appOrigin,
    spEntityId,
    acsUrl,
    sloUrl,
    idpEntityId,
    signingPrivateKeyPem,
    signingCertificatePem,
    usernameMode,
    attrUsername:
      process.env.TALENTLMS_SAML_ATTR_USERNAME?.trim() ||
      "urn:oid:1.3.6.1.4.1.5923.1.1.1.10",
    attrFirstName:
      process.env.TALENTLMS_SAML_ATTR_FIRSTNAME?.trim() || "urn:oid:2.5.4.42",
    attrLastName: process.env.TALENTLMS_SAML_ATTR_LASTNAME?.trim() || "urn:oid:2.5.4.4",
    attrEmail:
      process.env.TALENTLMS_SAML_ATTR_EMAIL?.trim() || "urn:oid:0.9.2342.19200300.100.1.3",
  };
}

/**
 * Same username rules as SAML (`TALENTLMS_SAML_USERNAME_MODE`) without loading signing keys.
 * Use when calling Talent REST (e.g. JIT user signup) so `login` matches SSO.
 */
export function getTalentLmsUsernamePolicyFromEnv(): Pick<
  TalentLmsSamlEnvironment,
  "usernameMode"
> {
  const modeRaw =
    process.env.TALENTLMS_SAML_USERNAME_MODE?.trim().toLowerCase() ?? "email";
  const usernameMode: TalentLmsSamlUsernameMode =
    modeRaw === "emaillocalpart" ||
    modeRaw === "email_local_part" ||
    modeRaw === "localpart"
      ? "emailLocalPart"
      : "email";
  return { usernameMode };
}

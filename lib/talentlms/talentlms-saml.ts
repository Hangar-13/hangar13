import {
  Constants,
  IdentityProvider,
  SamlLib,
  ServiceProvider,
} from "samlify";

import type { TalentLmsSamlEnvironment } from "@/lib/talentlms/saml-config";
import { ensureTalentLmsSamlValidator } from "@/lib/talentlms/saml-validator";

const SAML_NAME_FORMAT_URI = "urn:oasis:names:tc:SAML:2.0:attrname-format:uri";

export function resolveTalentLmsUsername(
  email: string,
  env: TalentLmsSamlEnvironment
): string {
  const trimmed = email.trim().toLowerCase();
  if (env.usernameMode === "emailLocalPart") {
    return trimmed.includes("@") ? trimmed.split("@")[0]! : trimmed;
  }
  return trimmed;
}

export function splitFullName(fullName: string | null | undefined): {
  first: string;
  last: string;
} {
  const t = (fullName ?? "").trim();
  if (!t) return { first: "User", last: "" };
  const i = t.indexOf(" ");
  if (i === -1) return { first: t, last: "" };
  return { first: t.slice(0, i).trim(), last: t.slice(i + 1).trim() };
}

export function loginUrlAbsolute(env: TalentLmsSamlEnvironment): string {
  return `${env.appOrigin}/api/auth/saml/talentlms/login`;
}

export function logoutUrlAbsolute(env: TalentLmsSamlEnvironment): string {
  return `${env.appOrigin}/api/auth/saml/talentlms/logout`;
}

/** HTML page that POSTs SAMLResponse (HTTP-POST binding) back to TalentLMS ACS. */
export function samlResponseAutoPostHtml(
  acsUrl: string,
  encodedSamlResponse: string,
  relayState?: string
): string {
  const rs = relayState
    ? `<input type="hidden" name="RelayState" value="${escapeHtmlEntity(relayState)}"/>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="visibility:hidden;margin:0">
<form method="post" action="${escapeHtmlEntity(acsUrl)}">
<input type="hidden" name="SAMLResponse" value="${escapeHtmlEntity(encodedSamlResponse)}"/>
${rs}</form>
<script>document.forms[0].submit();</script>
</body></html>`;
}

function escapeHtmlEntity(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

type LoginRequestExtract = {
  issuer?: unknown;
  request?: { id?: string };
};

export async function executeTalentlmsSamlExchange(options: Readonly<{
  env: TalentLmsSamlEnvironment;
  forwardQueryParams: Record<string, string>;
  relayState?: string | null;
  /** Used for SAML NameID and Email attribute — usually the learner email */
  normalizedEmailLower: string;
  /** Must match TalentLMS username mapping for that learner */
  talentLmsUsername: string;
  firstName: string;
  lastName: string;
}>): Promise<Readonly<{ entityEndpoint: string; encodedResponse: string }>> {
  ensureTalentLmsSamlValidator();

  const bindingRedirect = Constants.wording.binding.redirect;
  const bindingPost = Constants.wording.binding.post;

  const sp = ServiceProvider({
    entityID: options.env.spEntityId,
    authnRequestsSigned: false,
    wantAssertionsSigned: false,
    wantMessageSigned: false,
    nameIDFormat: [Constants.namespace.format.emailAddress],
    assertionConsumerService: [
      {
        Binding: Constants.namespace.binding.post,
        Location: options.env.acsUrl,
      },
    ],
    singleLogoutService: [
      {
        Binding: Constants.namespace.binding.redirect,
        Location: options.env.sloUrl,
      },
    ],
  });

  const loginResponseTemplate = {
    ...SamlLib.defaultLoginResponseTemplate,
    attributes: [
      {
        name: options.env.attrUsername,
        nameFormat: SAML_NAME_FORMAT_URI,
        valueTag: "Username",
        valueXsiType: "xs:string",
      },
      {
        name: options.env.attrFirstName,
        nameFormat: SAML_NAME_FORMAT_URI,
        valueTag: "FirstName",
        valueXsiType: "xs:string",
      },
      {
        name: options.env.attrLastName,
        nameFormat: SAML_NAME_FORMAT_URI,
        valueTag: "LastName",
        valueXsiType: "xs:string",
      },
      {
        name: options.env.attrEmail,
        nameFormat: SAML_NAME_FORMAT_URI,
        valueTag: "Email",
        valueXsiType: "xs:string",
      },
    ],
  };

  const idp = IdentityProvider({
    entityID: options.env.idpEntityId,
    privateKey: options.env.signingPrivateKeyPem,
    signingCert: options.env.signingCertificatePem,
    wantAuthnRequestsSigned: false,
    nameIDFormat: [Constants.namespace.format.emailAddress],
    singleSignOnService: [
      {
        Binding: Constants.namespace.binding.redirect,
        Location: loginUrlAbsolute(options.env),
      },
    ],
    singleLogoutService: [
      {
        Binding: Constants.namespace.binding.redirect,
        Location: logoutUrlAbsolute(options.env),
      },
    ],
    loginResponseTemplate,
  });

  const parseResult = await idp.parseLoginRequest(sp, bindingRedirect, {
    query: options.forwardQueryParams,
  });

  const ext = parseResult.extract as LoginRequestExtract;
  const issuer = String(ext.issuer ?? "").trim();
  if (issuer && issuer !== options.env.spEntityId) {
    throw new Error(
      `SAML AuthnRequest issuer mismatch (expected "${options.env.spEntityId}", received "${issuer}")`
    );
  }

  const inResponseTo = ext.request?.id ?? "";
  const authnInstant = new Date().toISOString();
  const sessionIndex = "_" + crypto.randomUUID();
  const authnStatement = `<saml:AuthnStatement AuthnInstant="${authnInstant}" SessionIndex="${sessionIndex}"><saml:AuthnContext><saml:AuthnContextClassRef>${Constants.namespace.authnContextClassRef.passwordProtectedTransport}</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`;

  const relayStateRelay = options.relayState ?? undefined;

  const composed = await idp.createLoginResponse(
    sp,
    parseResult,
    bindingPost,
    {},
    (preprocessedXml: string) => {
      const spEntityMeta = (
        sp as unknown as {
          entityMeta: { getEntityID(): string; getAssertionConsumerService(b: string): string };
        }
      ).entityMeta;
      const idpEntityMeta = (
        idp as unknown as {
          entityMeta: { getEntityID(): string };
          entitySetting: { generateID(): string };
        }
      ).entityMeta;
      const idpSettingRef = (idp as unknown as { entitySetting: { generateID(): string } }).entitySetting;

      const id = idpSettingRef.generateID();
      const assertionId = idpSettingRef.generateID();
      const now = new Date();
      const notAfter = new Date(now.getTime() + 5 * 60 * 1000);

      const spEntityID = spEntityMeta.getEntityID();
      const acsUrlResolved = spEntityMeta.getAssertionConsumerService(bindingPost);

      const tvalue: Record<string, string> = {
        ID: id,
        AssertionID: assertionId,
        Destination: acsUrlResolved,
        Audience: spEntityID,
        EntityID: spEntityID,
        SubjectRecipient: acsUrlResolved,
        Issuer: idpEntityMeta.getEntityID(),
        IssueInstant: now.toISOString(),
        AssertionConsumerServiceURL: acsUrlResolved,
        StatusCode: Constants.namespace.statusCode.success,
        ConditionsNotBefore: now.toISOString(),
        ConditionsNotOnOrAfter: notAfter.toISOString(),
        SubjectConfirmationDataNotOnOrAfter: notAfter.toISOString(),
        NameIDFormat: Constants.namespace.format.emailAddress,
        NameID: options.normalizedEmailLower,
        InResponseTo: inResponseTo,
        AuthnStatement: authnStatement,
        attrUsername: options.talentLmsUsername,
        attrFirstName: options.firstName,
        attrLastName: options.lastName,
        attrEmail: options.normalizedEmailLower,
      };

      return {
        id,
        context: SamlLib.replaceTagsByValue(preprocessedXml, tvalue),
      };
    },
    false,
    relayStateRelay
  );

  const encoded =
    composed && typeof composed.context === "string" ? composed.context : null;

  if (!encoded || typeof composed.entityEndpoint !== "string") {
    throw new Error("TalentLMS SAML login response composition failed");
  }

  return { entityEndpoint: composed.entityEndpoint, encodedResponse: encoded };
}

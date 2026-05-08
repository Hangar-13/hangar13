import { createPrivateKey, X509Certificate, type KeyObject } from "node:crypto";

/** Unescape `\\n`, strip BOM / optional wrapping quotes, normalize newlines (helps Vercel `.env`). */
export function unwrapAndNormalizeLineEndingsPem(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").replace(/\\n/g, "\n");
  s = s.replace(/^\uFEFF/, "").trim();

  while (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  return s.endsWith("\n") ? s : `${s}\n`;
}

/** Load RSA PEM and re-export PKCS#1 for samlify / xml-crypto. */
export function toNormalizedPkcs1RsaPrivateKeyPem(pemSource: string): string {
  const pem = unwrapAndNormalizeLineEndingsPem(pemSource);

  let key: KeyObject;
  try {
    key = createPrivateKey({ key: pem, format: "pem" });
  } catch (e) {
    const hint = e instanceof Error ? e.message : String(e);
    throw new Error(
      `TALENTLMS_IDP_SIGNING_PRIVATE_KEY: invalid PEM (${hint}). ` +
        "Use the private key blob only (BEGIN … KEY … END …), RSA, with real line breaks or `\\n` in a single line — no wrapping quotes."
    );
  }

  if (key.asymmetricKeyType !== "rsa") {
    throw new Error("TALENTLMS_IDP_SIGNING_PRIVATE_KEY must be RSA for Talent LMS SAML.");
  }

  return key.export({ type: "pkcs1", format: "pem" }) as string;
}

export function assertSigningCertificatePem(pemSource: string): string {
  const pem = unwrapAndNormalizeLineEndingsPem(pemSource);

  try {
    new X509Certificate(pem);
  } catch (e) {
    const hint = e instanceof Error ? e.message : String(e);
    throw new Error(
      `TALENTLMS_IDP_SIGNING_CERTIFICATE: invalid PEM (${hint}). Use BEGIN CERTIFICATE … END CERTIFICATE only.`
    );
  }

  return pem;
}

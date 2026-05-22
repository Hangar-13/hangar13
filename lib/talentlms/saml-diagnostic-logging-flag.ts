/** When true, SAML IdP route logs asserted email/username (PII) — disable after debugging. */
export function isTalentLmsSamlDiagnosticLoggingEnabled(): boolean {
  const v = process.env.TALENTLMS_SAML_DIAGNOSTIC_LOGGING?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

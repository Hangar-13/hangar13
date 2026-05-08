import { setSchemaValidator } from "samlify";

let validatorRegistered = false;

/**
 * samlify requires {@link setSchemaValidator}. XSD validation is optional; strict DOM
 * parsing rejects some vendor SAML messages with unusual namespaces or insignificant
 * whitespace and surfaces as misleading `ERR_INVALID_XML`.
 *
 * Keep a coarse gate and let samlify's XPath extractor handle malformed documents.
 */
export function ensureTalentLmsSamlValidator(): void {
  if (validatorRegistered) return;
  validatorRegistered = true;
  setSchemaValidator({
    validate(xml: string) {
      const t = xml.trim();
      if (t.length < 20) {
        return Promise.reject(new Error("SAML message too short"));
      }
      const looksOk = /(?:^|[^\w])(?:AuthnRequest|LogoutRequest|LogoutResponse)/.test(t);
      if (!looksOk) {
        return Promise.reject(new Error("Unsupported or invalid SAML envelope"));
      }
      return Promise.resolve("accepted");
    },
  });
}

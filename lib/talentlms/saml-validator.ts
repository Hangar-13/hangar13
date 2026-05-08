import { setSchemaValidator } from "samlify";

let validatorRegistered = false;

/** samlify requires a schema validator callback; we only sanity-check the envelope. */
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

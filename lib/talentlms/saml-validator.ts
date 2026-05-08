import { DOMParser } from "@xmldom/xmldom";
import { setSchemaValidator } from "samlify";

let validatorRegistered = false;

/**
 * samlify requires setSchemaValidator; full XSD validation is optional.
 * We enforce well-formed XML and a SAML-ish root instead.
 */
export function ensureTalentLmsSamlValidator(): void {
  if (validatorRegistered) return;
  validatorRegistered = true;
  setSchemaValidator({
    validate(xml: string) {
      const doc = new DOMParser({
        errorHandler: {
          error(msg) {
            throw new Error(msg);
          },
          fatalError(msg) {
            throw new Error(msg);
          },
        },
      }).parseFromString(xml);
      const root = doc.documentElement?.localName?.toLowerCase();
      const okRoot =
        root === "authnrequest" ||
        root === "response" ||
        root === "logoutrequest" ||
        root === "logoutresponse";
      if (!okRoot) {
        return Promise.reject(new Error("Invalid SAML XML root"));
      }
      return Promise.resolve("accepted");
    },
  });
}

/**
 * SAML HTTP-Redirect binding uses base64-derived payloads (`+`, `/`), then URL-encoding.
 *
 * **`URLSearchParams` / `searchParams.get()` MUST NOT be used:** the WHATWG query parser
 * treats `+` as U+0020 for `application/x-www-form-urlencoded`, which corrupts
 * `SAMLRequest` and leads to deflate errors or `ERR_INVALID_XML` downstream.
 *
 * Split the raw `?foo=bar&...` string and decode each name/value exactly once via
 * `decodeURIComponent`. A literal `+` in the substring is preserved (base64-safe).
 */
export function parseSamlRedirectBindingQuery(search: string): Record<string, string> {
  const trimmed = search.startsWith("?") ? search.slice(1) : search;
  const out: Record<string, string> = {};
  if (!trimmed.length) return out;

  for (const part of trimmed.split("&")) {
    if (!part.length) continue;
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const rawVal = eq >= 0 ? part.slice(eq + 1) : "";
    try {
      const key = decodeURIComponent(rawKey);
      const value = decodeURIComponent(rawVal);
      if (key.length && !(key in out)) {
        out[key] = value;
      }
    } catch {
      continue;
    }
  }

  return out;
}

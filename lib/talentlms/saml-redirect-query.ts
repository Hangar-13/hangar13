/**
 * Query substring taken from the **literal** serialized request URL (everything after `?`
 * until `#`), without constructing `URLSearchParams`.
 *
 * `request.nextUrl.search` can differ from how the UA sent SAML parameters; SAML
 * HTTP-Redirect payloads are base64 and must preserve `+` unless encoded as `%2B`.
 */
export function extractRawUrlQueryWithoutLeadingQuestion(fullUrlString: string): string {
  const q = fullUrlString.indexOf("?");
  if (q < 0) return "";

  let end = fullUrlString.indexOf("#", q + 1);
  if (end < 0) end = fullUrlString.length;

  return fullUrlString.slice(q + 1, end);
}

/**
 * SAML HTTP-Redirect binding (`SAMLRequest`, `RelayState`, optional `SigAlg` / `Signature`).
 *
 * **Do not use `URLSearchParams`/`searchParams`** for SAML parameters: WHATWG parsers
 * treat `+` as space and corrupt deflate+base64 payloads.
 *
 * @param queryOnlyOrWithQuestion Query string (`foo=bar&...`) optionally with leading `?`
 */
export function parseSamlRedirectBindingQuery(
  queryOnlyOrWithQuestion: string
): Record<string, string> {
  const trimmed = queryOnlyOrWithQuestion.startsWith("?")
    ? queryOnlyOrWithQuestion.slice(1)
    : queryOnlyOrWithQuestion;

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

/**
 * Optional key-value data on a logbook entry. Keys may grow over time;
 * known keys used in the UI today: `engine`, `propeller`.
 */
export type LogbookAdditionalInformation = {
  engine?: string;
  propeller?: string;
  [key: string]: unknown;
};

export function parseLogbookAdditionalInformation(
  raw: unknown
): LogbookAdditionalInformation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as LogbookAdditionalInformation;
}

/**
 * Updates only `engine` and `propeller` while preserving any other keys already stored.
 * Returns `null` when the resulting object would be empty.
 */
export function mergeLogbookAdditionalInformation(
  existing: unknown,
  engine: string,
  propeller: string
): LogbookAdditionalInformation | null {
  const next: Record<string, unknown> = {
    ...parseLogbookAdditionalInformation(existing),
  };
  const e = engine.trim();
  const p = propeller.trim();
  if (e) next.engine = e;
  else delete next.engine;
  if (p) next.propeller = p;
  else delete next.propeller;
  if (Object.keys(next).length === 0) return null;
  return next as LogbookAdditionalInformation;
}

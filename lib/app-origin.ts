/** Public site origin for absolute links (password reset, confirmation emails). */
export function parseOptionalOrigin(): string | null {
  const v =
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_SITE_URL;
  const t = v?.trim();
  return t ? t.replace(/\/$/, "") : null;
}

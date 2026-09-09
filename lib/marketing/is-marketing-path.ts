/** Public marketing chrome (no dashboard sidebar / top nav). */
export function isMarketingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/" || pathname.startsWith("/marketing/");
}

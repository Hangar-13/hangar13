/**
 * Natural (numeric-aware) ordering for FAA ACS code strings, e.g. K3 before K10.
 * Plain string / DB lexicographic order is wrong for trailing numeric segments.
 */
const acsCodeCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareAcsCodeString(a: string, b: string): number {
  return acsCodeCollator.compare(a, b);
}

export function sortByAcsCode<T extends { code: string }>(rows: T[]): T[] {
  return [...rows].sort((x, y) => compareAcsCodeString(x.code, y.code));
}

export function sortStringArrayByAcsCode(codes: string[]): string[] {
  return [...codes].sort(compareAcsCodeString);
}

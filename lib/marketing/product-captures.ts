export type ProductCaptureAudience = "mechanic" | "operator";

export type ProductCaptureId =
  | "mechanic-logbook"
  | "mechanic-coursework"
  | "mechanic-mentored"
  | "operator-roles"
  | "operator-assign"
  | "operator-approve";

/**
 * Recorded clips live in `public/marketing/captures/`.
 * Clip order matches the feature card order on the landing page
 * (see `value.mechanicItems` / `value.operatorItems` in landing-content.ts).
 */
export const CAPTURE_DIRECTORY = "/marketing/captures";

export const MECHANIC_CAPTURES: ProductCaptureId[] = [
  "mechanic-logbook",
  "mechanic-coursework",
  "mechanic-mentored",
];

export const OPERATOR_CAPTURES: ProductCaptureId[] = [
  "operator-roles",
  "operator-assign",
  "operator-approve",
];

/** Shown only while a clip file is missing, so you know which one to record. */
export const CAPTURE_PLACEHOLDER_LABELS: Record<ProductCaptureId, string> = {
  "mechanic-logbook": "Portable OJT logbook",
  "mechanic-coursework": "FAA-aligned coursework",
  "mechanic-mentored": "Mentored OJT",
  "operator-roles": "Roles that fit the floor",
  "operator-assign": "Assign and track coursework",
  "operator-approve": "Mentorship without the binder",
};

/** Used when a clip file is missing, so the tour still advances. */
export const CAPTURE_FALLBACK_MS = 5000;

export function capturesForAudience(audience: ProductCaptureAudience): ProductCaptureId[] {
  return audience === "mechanic" ? MECHANIC_CAPTURES : OPERATOR_CAPTURES;
}

export function captureVideoSrc(id: ProductCaptureId): string {
  return `${CAPTURE_DIRECTORY}/${id}.mp4`;
}

/** User-facing copy when no current training enrollment is active. */
export const NO_ACTIVE_TRAINING_ACTION =
  "Enroll in Find Training (or open My Training Programs to set your current program).";

export function noActiveTrainingServerError(): string {
  return `No active training enrollment. ${NO_ACTIVE_TRAINING_ACTION}`;
}

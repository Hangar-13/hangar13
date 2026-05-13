/** FAA mechanic certificate # as stored in the logbook flow: exactly seven digits, no prefix letter. */
export const MECHANIC_CERT_NUMBER_REGEX = /^[0-9]{7}$/;

export function isValidMechanicCertificateNumber(value: string): boolean {
  return MECHANIC_CERT_NUMBER_REGEX.test(value.trim());
}

export function sanitizeMechanicCertificateNumberInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 7);
}

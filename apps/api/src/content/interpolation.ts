/**
 * Clinic-token interpolation (SP2 spec §8).
 *
 * PURE, no I/O, no model. Applied *after* the fail-closed resolver has returned an
 * APPROVED string — the interpolated form is NEVER stored (the content library holds
 * only the tokenised source of truth; interpolation happens per-request from the
 * clinic config). This preserves stop-condition 9: a safety instruction is always
 * attributed to the clinic, and the clinic's own name/number is substituted at the
 * edge rather than baked into an approved translation.
 *
 * Tokens (spec §8):
 *   {CLINIC_NAME}      → clinic.name
 *   {CLINIC_PHONE}     → clinic.phone
 *   {CLINIC_EMERGENCY} → clinic.emergencyNumber   (the literal emergency number, e.g. 103)
 *   {OPENING_TIME}     → the opening `HH:mm` parsed from clinic.workingHours
 *
 * The literal "103" that already appears in the emergency strings is NOT a token —
 * it is the fixed national emergency number and stays verbatim. {CLINIC_EMERGENCY}
 * exists for clinics whose configured number differs.
 */

/** The clinic fields interpolation needs (structurally satisfied by `Clinic`). */
export interface ClinicTokenSource {
  name: string;
  phone: string;
  emergencyNumber: string;
  /** `HH:mm-HH:mm`, e.g. `09:00-18:00`. */
  workingHours: string;
}

/** The opening `HH:mm` from a `HH:mm-HH:mm` working-hours spec (empty when absent). */
export function openingTime(workingHours: string): string {
  const [open] = (workingHours ?? '').split('-');
  return (open ?? '').trim();
}

/**
 * Interpolate the clinic tokens into an already-resolved (approved) string.
 * Unknown tokens are left untouched; the function is a total, allocation-only
 * string transform with no side effects.
 */
export function interpolateClinicTokens(text: string, clinic: ClinicTokenSource): string {
  return text
    .replace(/\{CLINIC_NAME\}/g, clinic.name)
    .replace(/\{CLINIC_PHONE\}/g, clinic.phone)
    .replace(/\{CLINIC_EMERGENCY\}/g, clinic.emergencyNumber)
    .replace(/\{OPENING_TIME\}/g, openingTime(clinic.workingHours));
}

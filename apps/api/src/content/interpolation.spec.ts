import {
  ClinicTokenSource,
  interpolateClinicTokens,
  openingTime,
} from './interpolation';

/**
 * Pure interpolation unit tests (SP2 spec §8). The interpolated form is produced
 * per-request from the clinic config and is NEVER stored — these assert only the
 * substitution behaviour of the pure transform.
 */
describe('interpolateClinicTokens', () => {
  const clinic: ClinicTokenSource = {
    name: 'Tashkent Surgical Clinic',
    phone: '+998 71 200 00 00',
    emergencyNumber: '103',
    workingHours: '09:00-18:00',
  };

  it('fills every clinic token', () => {
    const src =
      "{CLINIC_NAME} is closed. Reviewed at {OPENING_TIME}. Call {CLINIC_EMERGENCY} or {CLINIC_PHONE}.";
    expect(interpolateClinicTokens(src, clinic)).toBe(
      'Tashkent Surgical Clinic is closed. Reviewed at 09:00. Call 103 or +998 71 200 00 00.',
    );
  });

  it('replaces every occurrence of a repeated token (global)', () => {
    const src = '{CLINIC_NAME} — {CLINIC_NAME}';
    expect(interpolateClinicTokens(src, clinic)).toBe(
      'Tashkent Surgical Clinic — Tashkent Surgical Clinic',
    );
  });

  it('leaves a string with no tokens unchanged', () => {
    expect(interpolateClinicTokens('Contact clinic', clinic)).toBe('Contact clinic');
  });

  it('leaves unknown tokens untouched', () => {
    expect(interpolateClinicTokens('{UNKNOWN_TOKEN} {CLINIC_PHONE}', clinic)).toBe(
      '{UNKNOWN_TOKEN} +998 71 200 00 00',
    );
  });

  it('does not treat the literal 103 in a string as a token', () => {
    expect(interpolateClinicTokens("Your clinic's instruction: call 103 now.", clinic)).toBe(
      "Your clinic's instruction: call 103 now.",
    );
  });

  describe('openingTime', () => {
    it('returns the opening HH:mm of a working-hours spec', () => {
      expect(openingTime('09:00-18:00')).toBe('09:00');
    });

    it('returns empty string for an empty spec', () => {
      expect(openingTime('')).toBe('');
    });
  });
});

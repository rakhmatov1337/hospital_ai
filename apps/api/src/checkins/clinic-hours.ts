import { DateTime } from 'luxon';

/**
 * `within_clinic_hours` — computed server-side in the CLINIC timezone (SP2 spec
 * §2/§4). It decides which confirmation content key a non-emergency check-in
 * returns (in-hours vs `checkin.submitted.out_of_hours`) and whether the ladder
 * places a live call. EMERGENCY ignores it entirely (self-directs to 103, 24/7).
 *
 * PURE. Reads "now" from the injectable Clock (never `new Date()` inline) so the
 * boundary is deterministically testable. No I/O, no model.
 */

/** The clinic fields this computation needs (structurally satisfied by `Clinic`). */
export interface ClinicHoursConfig {
  timezone: string;
  /** `HH:mm-HH:mm`, e.g. `09:00-18:00`. */
  workingHours: string;
  /** `Mon-Sat` (inclusive range) or a comma list `Mon,Tue,Wed`. */
  workingDays: string;
}

/** Day abbreviation → luxon weekday number (Mon = 1 … Sun = 7). */
const WEEKDAYS: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

/** Parse `Mon-Sat` / `Mon,Tue,…` into the set of luxon weekday numbers. */
function parseWorkingDays(spec: string): Set<number> {
  const days = new Set<number>();
  const s = spec.trim();
  if (s === '') return days;

  if (s.includes('-')) {
    const [rawStart, rawEnd] = s.split('-');
    const start = WEEKDAYS[rawStart.trim().toLowerCase().slice(0, 3)];
    const end = WEEKDAYS[rawEnd?.trim().toLowerCase().slice(0, 3) ?? ''];
    if (start === undefined || end === undefined) return days;
    // Inclusive range with week wrap (e.g. Sat-Mon).
    let d = start;
    for (let guard = 0; guard < 7; guard += 1) {
      days.add(d);
      if (d === end) break;
      d = d === 7 ? 1 : d + 1;
    }
    return days;
  }

  for (const part of s.split(',')) {
    const n = WEEKDAYS[part.trim().toLowerCase().slice(0, 3)];
    if (n !== undefined) days.add(n);
  }
  return days;
}

/** Parse `HH:mm` into minutes-of-day, or null when malformed. */
function parseMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

/**
 * True when `now` (clinic-local) falls on a working day within `[open, close)`.
 * Fail-closed on a malformed config (treated as out-of-hours) so a bad clinic
 * row can never mislabel a submission as "in hours".
 */
export function isWithinClinicHours(now: Date, clinic: ClinicHoursConfig): boolean {
  const local = DateTime.fromJSDate(now, { zone: clinic.timezone });
  if (!local.isValid) return false;

  const days = parseWorkingDays(clinic.workingDays);
  if (!days.has(local.weekday)) return false;

  const [openStr, closeStr] = clinic.workingHours.split('-');
  const open = parseMinutes(openStr ?? '');
  const close = parseMinutes(closeStr ?? '');
  if (open === null || close === null) return false;

  const minutes = local.hour * 60 + local.minute;
  return minutes >= open && minutes < close;
}

/** Clinic-local UTC offset for `now`, e.g. `+05:00` (telemetry `local_offset`). */
export function clinicLocalOffset(now: Date, timezone: string): string {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  return local.isValid ? local.toFormat('ZZ') : '+00:00';
}

/** The clinic's opening time (`HH:mm`) for the `{OPENING_TIME}` token. */
export function clinicOpeningTime(workingHours: string): string {
  const [openStr] = workingHours.split('-');
  return (openStr ?? '').trim();
}

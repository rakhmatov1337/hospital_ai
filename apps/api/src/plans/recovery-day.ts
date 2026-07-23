import { DateTime } from 'luxon';

/**
 * Recovery-day engine.
 *
 * `recovery_day = floor(now_local − discharge_date)` computed in the CLINIC
 * timezone, with discharge = day 0. Everything is stored UTC; day boundaries are
 * evaluated against clinic-local calendar dates. A recovery_day off-by-one shifts
 * every generated task, so the computation is DST-safe by construction (see below).
 */

/**
 * The clinic-local calendar day of recovery for `now`, relative to `dischargeDate`.
 * Discharge day = 0, the next clinic-local calendar day = 1, and so on.
 *
 * DST-safety: both instants are reduced to their clinic-local calendar date, then
 * each date is re-anchored to a UTC midnight before differencing. This makes the
 * result a pure calendar-day count that never depends on how many real hours a
 * given local day happened to contain (a 23h spring-forward day still counts as 1).
 */
export function recoveryDay(
  dischargeDate: Date,
  now: Date,
  clinicTz: string,
): number {
  const dischargeLocal = DateTime.fromJSDate(dischargeDate, {
    zone: clinicTz,
  }).startOf('day');
  const nowLocal = DateTime.fromJSDate(now, { zone: clinicTz }).startOf('day');

  // Re-anchor each local calendar date to a DST-free UTC midnight so the
  // difference is an exact integer count of calendar days.
  const dischargeAnchor = Date.UTC(
    dischargeLocal.year,
    dischargeLocal.month - 1,
    dischargeLocal.day,
  );
  const nowAnchor = Date.UTC(nowLocal.year, nowLocal.month - 1, nowLocal.day);

  const MS_PER_DAY = 86_400_000;
  return Math.floor((nowAnchor - dischargeAnchor) / MS_PER_DAY);
}

/** UTC schedule instant + window close for one templated task. */
export interface ScheduledWindow {
  scheduledFor: Date;
  windowClosesAt: Date;
}

/**
 * The UTC instant a task on `recoveryDayNumber` at clinic-local `scheduledTime`
 * ("HH:mm") is due, plus the UTC instant its completion window closes.
 *
 * Uses calendar-aware `plus({ days })` so the wall-clock local time is preserved
 * across DST transitions (adding days is not the same as adding 24h blocks), then
 * converts the resolved clinic-local wall time to UTC for storage.
 */
export function taskScheduledFor(
  dischargeDate: Date,
  recoveryDayNumber: number,
  scheduledTime: string,
  windowMinutes: number,
  clinicTz: string,
): ScheduledWindow {
  const [hourPart, minutePart] = scheduledTime.split(':');
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart ?? '0', 10);

  const dischargeLocal = DateTime.fromJSDate(dischargeDate, {
    zone: clinicTz,
  }).startOf('day');

  const scheduledLocal = dischargeLocal
    .plus({ days: recoveryDayNumber })
    .set({ hour, minute, second: 0, millisecond: 0 });

  const closesLocal = scheduledLocal.plus({ minutes: windowMinutes });

  return {
    scheduledFor: scheduledLocal.toUTC().toJSDate(),
    windowClosesAt: closesLocal.toUTC().toJSDate(),
  };
}

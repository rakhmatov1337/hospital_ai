import { DateTime } from 'luxon';
import { recoveryDay, taskScheduledFor } from './recovery-day';

/** Build a JS Date for an exact clinic-local wall time. */
function localInstant(
  zone: string,
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
  },
): Date {
  return DateTime.fromObject(
    { second: 0, millisecond: 0, ...parts },
    { zone },
  ).toJSDate();
}

describe('recoveryDay', () => {
  it('treats discharge day as day 0', () => {
    const tz = 'Asia/Tashkent';
    const discharge = localInstant(tz, { year: 2026, month: 1, day: 1 });
    const sameDay = localInstant(tz, {
      year: 2026,
      month: 1,
      day: 1,
      hour: 23,
      minute: 30,
    });
    expect(recoveryDay(discharge, sameDay, tz)).toBe(0);
  });

  // Day-boundary: two instants two minutes apart that straddle clinic-local
  // midnight must land on different recovery days.
  it('increments the day exactly at the clinic-local midnight boundary', () => {
    const tz = 'Asia/Tashkent'; // UTC+5, no DST — a clean local-midnight boundary
    const discharge = localInstant(tz, { year: 2026, month: 1, day: 1 });

    const beforeMidnight = localInstant(tz, {
      year: 2026,
      month: 1,
      day: 6,
      hour: 23,
      minute: 59,
    });
    const afterMidnight = localInstant(tz, {
      year: 2026,
      month: 1,
      day: 7,
      hour: 0,
      minute: 1,
    });

    // Only two minutes of real time separate them, but they cross local midnight.
    expect(afterMidnight.getTime() - beforeMidnight.getTime()).toBe(2 * 60_000);
    expect(recoveryDay(discharge, beforeMidnight, tz)).toBe(5);
    expect(recoveryDay(discharge, afterMidnight, tz)).toBe(6);
  });

  // DST spring-forward: 2026-03-08 in America/New_York loses an hour (02:00→03:00),
  // so the calendar day discharge→next-day spans only 23 real hours. A naive
  // "elapsed ms / 24h" count would floor to 0; the calendar-day count is 1.
  it('counts a spring-forward DST day as one full recovery day', () => {
    const tz = 'America/New_York';
    const discharge = localInstant(tz, { year: 2026, month: 3, day: 8 });
    const nextLocalDay = localInstant(tz, { year: 2026, month: 3, day: 9 });

    // Real elapsed time is only 23 hours because of spring-forward.
    const elapsedHours =
      (nextLocalDay.getTime() - discharge.getTime()) / 3_600_000;
    expect(elapsedHours).toBe(23);
    // Naive ms/day would be wrong...
    expect(Math.floor(elapsedHours / 24)).toBe(0);
    // ...the calendar-aware engine is right.
    expect(recoveryDay(discharge, nextLocalDay, tz)).toBe(1);
  });

  it('counts a fall-back DST day (25h) as one recovery day', () => {
    const tz = 'America/New_York';
    const discharge = localInstant(tz, { year: 2026, month: 11, day: 1 });
    const nextLocalDay = localInstant(tz, { year: 2026, month: 11, day: 2 });

    const elapsedHours =
      (nextLocalDay.getTime() - discharge.getTime()) / 3_600_000;
    expect(elapsedHours).toBe(25);
    expect(recoveryDay(discharge, nextLocalDay, tz)).toBe(1);
  });
});

describe('taskScheduledFor', () => {
  it('resolves the clinic-local wall time to a UTC instant', () => {
    const tz = 'Asia/Tashkent'; // UTC+5
    const discharge = localInstant(tz, { year: 2026, month: 1, day: 1 });

    const { scheduledFor, windowClosesAt } = taskScheduledFor(
      discharge,
      3,
      '08:00',
      120,
      tz,
    );

    // Day 3 at 08:00 Tashkent === 03:00 UTC.
    expect(scheduledFor.toISOString()).toBe('2026-01-04T03:00:00.000Z');
    // +120 minutes window.
    expect(windowClosesAt.toISOString()).toBe('2026-01-04T05:00:00.000Z');
  });

  // Across a DST boundary the wall-clock time is preserved (offset shifts), proving
  // day arithmetic is calendar-aware, not fixed 24h blocks.
  it('preserves clinic-local wall time across a DST transition', () => {
    const tz = 'America/New_York';
    // Discharge before spring-forward; day 2 lands after it.
    const discharge = localInstant(tz, { year: 2026, month: 3, day: 6 });

    const { scheduledFor } = taskScheduledFor(discharge, 2, '08:00', 60, tz);

    // 2026-03-08 08:00 America/New_York is EDT (UTC-4) => 12:00 UTC.
    expect(scheduledFor.toISOString()).toBe('2026-03-08T12:00:00.000Z');

    // Before DST the same 08:00 local is EST (UTC-5) => 13:00 UTC.
    const { scheduledFor: beforeDst } = taskScheduledFor(
      discharge,
      1,
      '08:00',
      60,
      tz,
    );
    expect(beforeDst.toISOString()).toBe('2026-03-07T13:00:00.000Z');
  });
});

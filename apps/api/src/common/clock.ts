import { Injectable } from '@nestjs/common';

/**
 * Injectable wall-clock.
 *
 * Every service and scheduled job reads "now" through this provider instead of
 * calling `new Date()` directly, so time-based behaviour (the escalation ladder,
 * `task_missed`, `within_clinic_hours`, `recovery_day`) is deterministically
 * testable — a test injects a {@link FixedClock} and advances it by hand.
 *
 * **Demo recovery-day offset (STAGING / DEMO ONLY).** SP1's `seed/clock.ts`
 * "advances" a patient's recovery by moving their `discharge_date` earlier —
 * because `recovery_day` is derived from `discharge_date` evaluated at *now*.
 * The wall-clock equivalent is to move *now* forward, which shifts every
 * patient's `recovery_day` forward at once. `DEMO_CLOCK_OFFSET_DAYS` (whole
 * days, matching the seed's day granularity) does exactly that; the optional
 * `DEMO_CLOCK_OFFSET_MINUTES` lets a demo nudge time-of-day (e.g. to cross a
 * clinic's opening boundary). Like `seed/clock.ts`, the offset is refused when
 * `NODE_ENV=production` — the demo clock must never exist in production.
 */
export abstract class Clock {
  /** The current instant (honours the demo offset in non-production). */
  abstract now(): Date;
}

/** Milliseconds in a day / a minute. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/** Parse an integer-ish env value; blank/NaN => 0. */
function envInt(name: string): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The demo offset in milliseconds (0 when no offset env is set). Throws if an
 * offset is configured while `NODE_ENV=production` — the demo clock is a
 * staging/demo helper only (mirrors the stop-condition in SP1's seed/clock.ts).
 */
export function demoClockOffsetMs(): number {
  const days = envInt('DEMO_CLOCK_OFFSET_DAYS');
  const minutes = envInt('DEMO_CLOCK_OFFSET_MINUTES');
  const offset = days * MS_PER_DAY + minutes * MS_PER_MINUTE;
  if (offset !== 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DEMO_CLOCK_OFFSET_* is a demo-only helper and must never run in production (NODE_ENV=production).',
    );
  }
  return offset;
}

/** The real system clock, offset by the demo mechanism in non-production. */
@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date(Date.now() + demoClockOffsetMs());
  }
}

/**
 * Deterministic test clock. Not registered in the DI graph by default — tests
 * (ladder job, task_missed, check-in hours) provide it in place of
 * {@link SystemClock} and drive time forward explicitly.
 */
export class FixedClock extends Clock {
  private current: Date;

  constructor(start: Date = new Date()) {
    super();
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  /** Pin the clock to an absolute instant. */
  set(instant: Date): void {
    this.current = new Date(instant);
  }

  /** Move the clock forward (or back, if negative) by `ms` milliseconds. */
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  /** Convenience: advance by whole minutes (used by the ladder tests). */
  advanceMinutes(minutes: number): void {
    this.advance(minutes * MS_PER_MINUTE);
  }
}

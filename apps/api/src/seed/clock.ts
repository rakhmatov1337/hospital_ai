import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';
import { recoveryDay } from '../plans/recovery-day';

/**
 * Demo clock-offset control (spec §7 — "advance a patient's recovery_day").
 *
 * There is no wall-clock time machine: `recovery_day` is derived from a patient's
 * `discharge_date` in the clinic timezone, so we "advance" a patient's recovery
 * simply by moving their discharge date earlier. This lets a demo jump a patient
 * forward through the 30-day programme without waiting real days.
 *
 * STAGING / DEMO ONLY. Every entry point refuses to run when NODE_ENV=production
 * (stop-condition — the clock offset must never exist in production).
 */

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'clock.ts is a demo-only helper and must never run in production (NODE_ENV=production).',
    );
  }
}

/**
 * Advance a patient's recovery by `days` (moving their discharge_date earlier by
 * `days` clinic-local calendar days). Pass a negative number to rewind. Returns
 * the patient's new recovery_day (evaluated at `now`, default: real now).
 */
export async function advancePatientRecoveryDay(
  prisma: PrismaClient,
  patientId: string,
  days: number,
  now: Date = new Date(),
): Promise<number> {
  assertNotProduction();

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { clinic: true },
  });
  if (!patient) {
    throw new Error(`advancePatientRecoveryDay: patient ${patientId} not found.`);
  }

  const tz = patient.clinic.timezone;
  const newDischarge = DateTime.fromJSDate(patient.dischargeDate, { zone: tz })
    .minus({ days })
    .toUTC()
    .toJSDate();

  await prisma.patient.update({
    where: { id: patientId },
    data: { dischargeDate: newDischarge },
  });

  return recoveryDay(newDischarge, now, tz);
}

/**
 * Set a patient to an ABSOLUTE recovery day by choosing a discharge_date that,
 * evaluated at `now` in the clinic timezone, yields exactly `targetDay`. Returns
 * the resulting discharge_date (UTC). Also used by the seed to place each demo
 * patient at their specified day.
 */
export async function setPatientRecoveryDay(
  prisma: PrismaClient,
  patientId: string,
  targetDay: number,
  now: Date = new Date(),
): Promise<Date> {
  assertNotProduction();

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { clinic: true },
  });
  if (!patient) {
    throw new Error(`setPatientRecoveryDay: patient ${patientId} not found.`);
  }

  const newDischarge = dischargeDateForRecoveryDay(targetDay, patient.clinic.timezone, now);
  await prisma.patient.update({
    where: { id: patientId },
    data: { dischargeDate: newDischarge },
  });
  return newDischarge;
}

/**
 * The UTC discharge_date that puts a patient at `targetDay` when evaluated at
 * `now` in `clinicTz`. Anchored to clinic-local midnight so `recoveryDay(...)`
 * returns exactly `targetDay` (pure calendar-day arithmetic, DST-safe).
 */
export function dischargeDateForRecoveryDay(
  targetDay: number,
  clinicTz: string,
  now: Date = new Date(),
): Date {
  return DateTime.fromJSDate(now, { zone: clinicTz })
    .startOf('day')
    .minus({ days: targetDay })
    .toUTC()
    .toJSDate();
}

import { Injectable } from '@nestjs/common';
import { ERROR_CODES, TaskType } from '@hospital-ai/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { taskScheduledFor } from './recovery-day';

/**
 * A single template row of a recovery plan (the shape that becomes a `PlanItem`).
 * The cadence — which task types fire on which recovery days — lives here so both
 * the seed (which persists PlanItems) and this generator share one source of truth.
 */
export interface PlanItemTemplate {
  recoveryDay: number;
  taskType: TaskType;
  /** Content-library key (never a patient-visible literal). */
  contentRef: string;
  /** Clinic-local time of day, "HH:mm". */
  scheduledTime: string;
  windowMinutes: number;
}

/**
 * Canonical 30-day cadence per the design spec §6/§7:
 *   - medication: Paracetamol 500mg 3×/day (08:00/14:00/20:00) days 1–10;
 *                 Antibiotic 1×/day (09:00) days 1–7.
 *   - wound_care: daily days 1–14.
 *   - activity:   gentle movement days 1–3, then progressive walking days 4–30.
 *   - education:  unlocks days 1/3/5/7/14/21.
 *   - checkin:    daily days 1–14, then every 3rd day (15/18/21/24/27/30).
 *
 * Both seeded procedures share this cadence; `procedureType` only distinguishes
 * the clinical education content keys (`clinical.{procedure}.day_{n}`).
 */
export function buildPlanItemTemplates(
  procedureType: string,
): PlanItemTemplate[] {
  const items: PlanItemTemplate[] = [];

  // --- Medication: Paracetamol 500mg 3×/day, days 1–10 ---
  for (let day = 1; day <= 10; day++) {
    for (const time of ['08:00', '14:00', '20:00']) {
      items.push({
        recoveryDay: day,
        taskType: TaskType.medication,
        contentRef: 'medication.paracetamol_500',
        scheduledTime: time,
        windowMinutes: 120,
      });
    }
  }

  // --- Medication: Antibiotic 1×/day at 09:00, days 1–7 ---
  for (let day = 1; day <= 7; day++) {
    items.push({
      recoveryDay: day,
      taskType: TaskType.medication,
      contentRef: 'medication.antibiotic',
      scheduledTime: '09:00',
      windowMinutes: 120,
    });
  }

  // --- Wound care: daily days 1–14 ---
  for (let day = 1; day <= 14; day++) {
    items.push({
      recoveryDay: day,
      taskType: TaskType.wound_care,
      contentRef: 'wound_care.daily',
      scheduledTime: '10:00',
      windowMinutes: 180,
    });
  }

  // --- Activity: gentle days 1–3, progressive walking days 4–30 ---
  for (let day = 1; day <= 30; day++) {
    const gentle = day <= 3;
    items.push({
      recoveryDay: day,
      taskType: TaskType.activity,
      contentRef: gentle ? 'activity.gentle_movement' : 'activity.walking',
      scheduledTime: '11:00',
      windowMinutes: 240,
    });
  }

  // --- Education: unlocks days 1/3/5/7/14/21 ---
  for (const day of [1, 3, 5, 7, 14, 21]) {
    items.push({
      recoveryDay: day,
      taskType: TaskType.education,
      contentRef: `clinical.${procedureType}.day_${day}`,
      scheduledTime: '12:00',
      windowMinutes: 720,
    });
  }

  // --- Check-in: daily days 1–14, then every 3rd day 15–30 ---
  const dailyCheckins = Array.from({ length: 14 }, (_, i) => i + 1);
  const spacedCheckins = [15, 18, 21, 24, 27, 30];
  for (const day of [...dailyCheckins, ...spacedCheckins]) {
    items.push({
      recoveryDay: day,
      taskType: TaskType.checkin,
      contentRef: 'checkin.daily',
      scheduledTime: '19:00',
      windowMinutes: 360,
    });
  }

  return items;
}

/**
 * Materialises the full 30-day task set for an enrolled patient from their
 * plan's `PlanItem` template rows (created up-front at enrolment — an offline
 * patient must still have every task). Each Task's `scheduled_for` /
 * `window_closes_at` are computed in the clinic timezone from the patient's
 * discharge date. Returns the number of tasks created.
 */
@Injectable()
export class TaskGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  async generateForPatient(patientId: string): Promise<number> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { clinic: true },
    });
    if (!patient) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient not found.', {
        patientId,
      });
    }
    if (!patient.planId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient has no recovery plan.', {
        patientId,
      });
    }

    const planItems = await this.prisma.planItem.findMany({
      where: { planId: patient.planId },
      orderBy: [{ recoveryDay: 'asc' }, { scheduledTime: 'asc' }],
    });
    if (planItems.length === 0) return 0;

    const clinicTz = patient.clinic.timezone;
    const data = planItems.map((item) => {
      const { scheduledFor, windowClosesAt } = taskScheduledFor(
        patient.dischargeDate,
        item.recoveryDay,
        item.scheduledTime,
        item.windowMinutes,
        clinicTz,
      );
      return {
        patientId: patient.id,
        planItemId: item.id,
        taskType: item.taskType,
        scheduledFor,
        windowClosesAt,
        recoveryDay: item.recoveryDay,
      };
    });

    const result = await this.prisma.task.createMany({ data });
    return result.count;
  }
}

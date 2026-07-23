import { DateTime } from 'luxon';
import { TaskType } from '@hospital-ai/shared-types';
import {
  buildPlanItemTemplates,
  TaskGenerationService,
  PlanItemTemplate,
} from './task-generation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('buildPlanItemTemplates (cadence)', () => {
  const items = buildPlanItemTemplates('laparoscopic_appendectomy');

  const daysFor = (type: TaskType): number[] =>
    items
      .filter((i) => i.taskType === type)
      .map((i) => i.recoveryDay)
      .sort((a, b) => a - b);

  it('generates the full laparoscopic_appendectomy task set (107 items)', () => {
    // 30 paracetamol + 7 antibiotic + 14 wound_care + 30 activity + 6 education + 20 checkin
    expect(items).toHaveLength(107);
  });

  it('schedules medication per the drug schedule', () => {
    const meds = items.filter((i) => i.taskType === TaskType.medication);
    // Paracetamol 3×/day days 1–10 = 30, Antibiotic 1×/day days 1–7 = 7.
    expect(meds).toHaveLength(37);

    const paracetamol = meds.filter(
      (i) => i.contentRef === 'medication.paracetamol_500',
    );
    expect(paracetamol).toHaveLength(30);
    const paracetamolTimes = [
      ...new Set(paracetamol.map((i) => i.scheduledTime)),
    ].sort();
    expect(paracetamolTimes).toEqual(['08:00', '14:00', '20:00']);
    expect(Math.max(...paracetamol.map((i) => i.recoveryDay))).toBe(10);

    const antibiotic = meds.filter(
      (i) => i.contentRef === 'medication.antibiotic',
    );
    expect(antibiotic).toHaveLength(7);
    expect(Math.max(...antibiotic.map((i) => i.recoveryDay))).toBe(7);
  });

  it('schedules wound care daily days 1–14', () => {
    expect(daysFor(TaskType.wound_care)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it('schedules activity gentle days 1–3 then walking days 4–30', () => {
    const activity = items.filter((i) => i.taskType === TaskType.activity);
    expect(activity).toHaveLength(30);
    const gentle = activity.filter(
      (i) => i.contentRef === 'activity.gentle_movement',
    );
    expect(gentle.map((i) => i.recoveryDay)).toEqual([1, 2, 3]);
    const walking = activity.filter((i) => i.contentRef === 'activity.walking');
    expect(walking.map((i) => i.recoveryDay)).toEqual(
      Array.from({ length: 27 }, (_, i) => i + 4),
    );
  });

  it('unlocks education on days 1/3/5/7/14/21 with procedure-scoped keys', () => {
    const education = items.filter((i) => i.taskType === TaskType.education);
    expect(education.map((i) => i.recoveryDay)).toEqual([1, 3, 5, 7, 14, 21]);
    expect(education.every((i) =>
      i.contentRef.startsWith('clinical.laparoscopic_appendectomy.'),
    )).toBe(true);
  });

  it('schedules check-ins daily days 1–14 then every 3rd day 15–30', () => {
    expect(daysFor(TaskType.checkin)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 21, 24, 27, 30,
    ]);
  });
});

describe('TaskGenerationService.generateForPatient', () => {
  const clinicTz = 'Asia/Tashkent';
  const discharge = DateTime.fromObject(
    { year: 2026, month: 1, day: 1 },
    { zone: clinicTz },
  ).toJSDate();

  const planItems: Array<PlanItemTemplate & { id: string; planId: string }> = [
    {
      id: 'pi-1',
      planId: 'plan-1',
      recoveryDay: 1,
      taskType: TaskType.checkin,
      contentRef: 'checkin.daily',
      scheduledTime: '19:00',
      windowMinutes: 360,
    },
    {
      id: 'pi-2',
      planId: 'plan-1',
      recoveryDay: 3,
      taskType: TaskType.medication,
      contentRef: 'medication.paracetamol_500',
      scheduledTime: '08:00',
      windowMinutes: 120,
    },
  ];

  function buildPrismaMock() {
    const createMany = jest.fn().mockResolvedValue({ count: planItems.length });
    const prisma = {
      patient: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'patient-1',
          planId: 'plan-1',
          dischargeDate: discharge,
          clinic: { timezone: clinicTz },
        }),
      },
      planItem: {
        findMany: jest.fn().mockResolvedValue(planItems),
      },
      task: { createMany },
    } as unknown as PrismaService;
    return { prisma, createMany };
  }

  it('materialises one task per plan item with clinic-tz-resolved schedule', async () => {
    const { prisma, createMany } = buildPrismaMock();
    const service = new TaskGenerationService(prisma);

    const count = await service.generateForPatient('patient-1');

    expect(count).toBe(2);
    expect(createMany).toHaveBeenCalledTimes(1);
    const { data } = createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);

    // Each generated Task carries the correct shape.
    const checkin = data.find((d: { taskType: string }) => d.taskType === TaskType.checkin);
    expect(checkin).toMatchObject({
      patientId: 'patient-1',
      planItemId: 'pi-1',
      taskType: TaskType.checkin,
      recoveryDay: 1,
    });
    // Day 1 19:00 Tashkent (UTC+5) === 14:00 UTC; +360min window => 20:00 UTC.
    expect(checkin.scheduledFor.toISOString()).toBe('2026-01-02T14:00:00.000Z');
    expect(checkin.windowClosesAt.toISOString()).toBe(
      '2026-01-02T20:00:00.000Z',
    );

    const med = data.find((d: { taskType: string }) => d.taskType === TaskType.medication);
    // Day 3 08:00 Tashkent === 03:00 UTC.
    expect(med.scheduledFor.toISOString()).toBe('2026-01-04T03:00:00.000Z');
    expect(med.recoveryDay).toBe(3);
  });

  it('throws NOT_FOUND when the patient is missing', async () => {
    const { prisma } = buildPrismaMock();
    (prisma.patient.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const service = new TaskGenerationService(prisma);
    await expect(service.generateForPatient('nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns 0 when the plan has no items', async () => {
    const { prisma, createMany } = buildPrismaMock();
    (prisma.planItem.findMany as jest.Mock).mockResolvedValueOnce([]);
    const service = new TaskGenerationService(prisma);
    expect(await service.generateForPatient('patient-1')).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

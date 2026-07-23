import { PrismaClient, TaskStatus, Tier, EscalationStatus, PatientStatus, Language } from '@prisma/client';
import { TaskGenerationService } from '../plans/task-generation.service';
import { dischargeDateForRecoveryDay } from './clock';

/**
 * The six demo patients (spec §7). Each is placed at a specific recovery day and
 * driven into one of the demo states the dashboard needs to show:
 *
 *   DEMO-01  day 6   good adherence (~85%), routine — no open escalation
 *   DEMO-02  day 3   open URGENT, unacknowledged ~20 min (ladder running, breach approaching)
 *   DEMO-03  day 12  URGENT already acknowledged + contacted, with an outcome recorded
 *   DEMO-04  day 8   disengaged: adherent until day 4, nothing for the last ~4 days (attention flag)
 *   DEMO-05  day 29  near completion, good adherence, end-of-programme survey now due
 *   DEMO-06  day 1   just enrolled — full 30-day task set generated, nothing done yet
 *
 * recovery_day is set by choosing each patient's discharge_date in the clinic
 * timezone (see dischargeDateForRecoveryDay); escalation rows are seeded directly
 * against the SP1 schema (the live tiering engine that CREATES them is SP2).
 */

export type DemoState =
  | 'good_adherence'
  | 'urgent_open'
  | 'urgent_contacted'
  | 'disengaged'
  | 'near_completion'
  | 'just_enrolled';

export interface DemoPatientSpec {
  patientRef: string;
  name: string;
  phone: string;
  ageBand: string;
  procedureType: string;
  language: Language;
  recoveryDay: number;
  enrolmentCode: string;
  status: PatientStatus;
  state: DemoState;
}

export const DEMO_PATIENTS: DemoPatientSpec[] = [
  {
    patientRef: 'DEMO-01',
    name: 'Demo Patient One',
    phone: '+998900000001',
    ageBand: '30-39',
    procedureType: 'laparoscopic_appendectomy',
    language: Language.EN,
    recoveryDay: 6,
    enrolmentCode: 'DEMOA2',
    status: PatientStatus.active,
    state: 'good_adherence',
  },
  {
    patientRef: 'DEMO-02',
    name: 'Demo Patient Two',
    phone: '+998900000002',
    ageBand: '40-49',
    procedureType: 'laparoscopic_appendectomy',
    language: Language.UZ,
    recoveryDay: 3,
    enrolmentCode: 'DEMOA3',
    status: PatientStatus.active,
    state: 'urgent_open',
  },
  {
    patientRef: 'DEMO-03',
    name: 'Demo Patient Three',
    phone: '+998900000003',
    ageBand: '50-59',
    procedureType: 'open_hernia_repair',
    language: Language.RU,
    recoveryDay: 12,
    enrolmentCode: 'DEMOA4',
    status: PatientStatus.active,
    state: 'urgent_contacted',
  },
  {
    patientRef: 'DEMO-04',
    name: 'Demo Patient Four',
    phone: '+998900000004',
    ageBand: '25-29',
    procedureType: 'laparoscopic_appendectomy',
    language: Language.UZ,
    recoveryDay: 8,
    enrolmentCode: 'DEMOA5',
    status: PatientStatus.active,
    state: 'disengaged',
  },
  {
    patientRef: 'DEMO-05',
    name: 'Demo Patient Five',
    phone: '+998900000005',
    ageBand: '60-69',
    procedureType: 'open_hernia_repair',
    language: Language.EN,
    recoveryDay: 29,
    enrolmentCode: 'DEMOA6',
    status: PatientStatus.active,
    state: 'near_completion',
  },
  {
    patientRef: 'DEMO-06',
    name: 'Demo Patient Six',
    phone: '+998900000006',
    ageBand: '35-44',
    procedureType: 'open_hernia_repair',
    language: Language.RU,
    recoveryDay: 1,
    enrolmentCode: 'DEMOA7',
    status: PatientStatus.enrolled,
    state: 'just_enrolled',
  },
];

const CONSENT_VERSION = 'v1';
const CONSENT_TEXT =
  'Demo consent (placeholder): I agree to take part in the 30-day recovery programme and to my clinical team using my recovery information for my care.';
const QUESTION_SET_VERSION = 'v1';
const RULE_VERSION = 'v1';

export interface DemoPatientResult {
  patientRef: string;
  patientId: string;
  state: DemoState;
  tasksGenerated: number;
  tasksCompleted: number;
  tasksMissed: number;
  escalations: number;
}

export interface SeedDemoOptions {
  prisma: PrismaClient;
  taskGen: TaskGenerationService;
  clinicId: string;
  timezone: string;
  /** procedureType -> RecoveryPlan.id */
  planByProcedure: Record<string, string>;
  now: Date;
}

/** Create the six demo patients with their tasks, adherence, and escalations. */
export async function seedDemoPatients(
  opts: SeedDemoOptions,
): Promise<DemoPatientResult[]> {
  const results: DemoPatientResult[] = [];
  for (const spec of DEMO_PATIENTS) {
    results.push(await seedOneDemoPatient(opts, spec));
  }
  return results;
}

async function seedOneDemoPatient(
  opts: SeedDemoOptions,
  spec: DemoPatientSpec,
): Promise<DemoPatientResult> {
  const { prisma, taskGen, clinicId, timezone, planByProcedure, now } = opts;

  const planId = planByProcedure[spec.procedureType];
  if (!planId) {
    throw new Error(`No seeded plan for procedure ${spec.procedureType}`);
  }

  const dischargeDate = dischargeDateForRecoveryDay(spec.recoveryDay, timezone, now);

  const patient = await prisma.patient.create({
    data: {
      clinicId,
      patientRef: spec.patientRef,
      name: spec.name,
      phone: spec.phone,
      ageBand: spec.ageBand,
      procedureType: spec.procedureType,
      dischargeDate,
      language: spec.language,
      planId,
      status: spec.status,
      enrolmentCode: spec.enrolmentCode,
      codeExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      consentVersion: CONSENT_VERSION,
      consentedAt: now,
    },
  });

  await prisma.consent.create({
    data: {
      patientId: patient.id,
      version: CONSENT_VERSION,
      acceptedAt: now,
      textSnapshot: CONSENT_TEXT,
    },
  });

  const tasksGenerated = await taskGen.generateForPatient(patient.id);

  let tasksCompleted = 0;
  let tasksMissed = 0;
  let escalations = 0;

  switch (spec.state) {
    case 'good_adherence':
    case 'urgent_open':
    case 'urgent_contacted': {
      const adh = await applyAdherence(prisma, patient.id, now, 0.85);
      tasksCompleted = adh.completed;
      tasksMissed = adh.missed;
      break;
    }
    case 'near_completion': {
      const adh = await applyAdherence(prisma, patient.id, now, 0.9);
      tasksCompleted = adh.completed;
      tasksMissed = adh.missed;
      break;
    }
    case 'disengaged': {
      // Adherent through day 4, then disengaged: everything past-due from day 5
      // onward is missed (attention flag).
      const adh = await applyDisengagement(prisma, patient.id, now, 4, 0.85);
      tasksCompleted = adh.completed;
      tasksMissed = adh.missed;
      break;
    }
    case 'just_enrolled':
      // Nothing done yet — all tasks stay pending.
      break;
  }

  if (spec.state === 'urgent_open') {
    escalations += await seedOpenUrgentEscalation(prisma, patient.id, spec, now);
  }
  if (spec.state === 'urgent_contacted') {
    escalations += await seedContactedEscalation(prisma, patient.id, spec, now);
  }

  return {
    patientRef: spec.patientRef,
    patientId: patient.id,
    state: spec.state,
    tasksGenerated,
    tasksCompleted,
    tasksMissed,
    escalations,
  };
}

interface AdherenceCounts {
  completed: number;
  missed: number;
}

/**
 * Mark every already-closed task (window_closes_at < now) as completed or missed,
 * hitting roughly `ratio` completion deterministically. Future tasks stay pending.
 */
async function applyAdherence(
  prisma: PrismaClient,
  patientId: string,
  now: Date,
  ratio: number,
): Promise<AdherenceCounts> {
  const pastDue = await prisma.task.findMany({
    where: { patientId, windowClosesAt: { lt: now } },
    orderBy: [{ recoveryDay: 'asc' }, { scheduledFor: 'asc' }],
  });

  // Deterministic miss cadence: with ratio 0.85, miss ~1 in 7.
  const missEvery = Math.max(2, Math.round(1 / Math.max(0.01, 1 - ratio)));
  let completed = 0;
  let missed = 0;

  for (let i = 0; i < pastDue.length; i++) {
    const task = pastDue[i];
    const isMiss = (i + 1) % missEvery === 0;
    if (isMiss) {
      await markMissed(prisma, task.id);
      missed++;
    } else {
      await markCompleted(prisma, task.id, task.scheduledFor);
      completed++;
    }
  }
  return { completed, missed };
}

/**
 * Adherent (ratio) up to and including `throughDay`, then fully disengaged: all
 * past-due tasks after `throughDay` are missed.
 */
async function applyDisengagement(
  prisma: PrismaClient,
  patientId: string,
  now: Date,
  throughDay: number,
  ratio: number,
): Promise<AdherenceCounts> {
  const pastDue = await prisma.task.findMany({
    where: { patientId, windowClosesAt: { lt: now } },
    orderBy: [{ recoveryDay: 'asc' }, { scheduledFor: 'asc' }],
  });

  const missEvery = Math.max(2, Math.round(1 / Math.max(0.01, 1 - ratio)));
  let completed = 0;
  let missed = 0;
  let earlyIdx = 0;

  for (const task of pastDue) {
    if (task.recoveryDay <= throughDay) {
      const isMiss = (earlyIdx + 1) % missEvery === 0;
      earlyIdx++;
      if (isMiss) {
        await markMissed(prisma, task.id);
        missed++;
      } else {
        await markCompleted(prisma, task.id, task.scheduledFor);
        completed++;
      }
    } else {
      await markMissed(prisma, task.id);
      missed++;
    }
  }
  return { completed, missed };
}

async function markCompleted(
  prisma: PrismaClient,
  taskId: string,
  scheduledFor: Date,
): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: TaskStatus.completed,
      completedAt: new Date(scheduledFor.getTime() + 30 * 60 * 1000),
      onTime: true,
      completionKey: `seed-${taskId}`,
    },
  });
}

async function markMissed(prisma: PrismaClient, taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: TaskStatus.missed, onTime: false },
  });
}

/**
 * DEMO-02: an urgent check-in submitted ~20 min ago whose escalation is still
 * `new` (unacknowledged). Two notification attempts recorded — the ladder is
 * running and, with the clinic's 15-min ack / 30-min breach timings, the breach
 * is approaching.
 */
async function seedOpenUrgentEscalation(
  prisma: PrismaClient,
  patientId: string,
  spec: DemoPatientSpec,
  now: Date,
): Promise<number> {
  const submittedAt = new Date(now.getTime() - 20 * 60 * 1000);

  const checkIn = await prisma.checkIn.create({
    data: {
      patientId,
      submittedAt,
      recoveryDay: spec.recoveryDay,
      questionSetVersion: QUESTION_SET_VERSION,
      ruleVersion: RULE_VERSION,
      tierAssigned: Tier.urgent,
      withinClinicHours: true,
    },
  });

  await seedCheckInAnswers(prisma, checkIn.id, {
    'checkin.q1': '7',
    'checkin.q2': 'no',
    'checkin.q3': 'very_red',
    'checkin.q4': 'yes',
    'checkin.q5': 'no',
    'checkin.q6': 'yes',
    'checkin.q7': 'partial',
  });

  const escalation = await prisma.escalation.create({
    data: {
      checkinId: checkIn.id,
      patientId,
      tier: Tier.urgent,
      status: EscalationStatus.new,
      createdAt: submittedAt,
    },
  });

  // Attempt 1: on-duty nurse notified at t-20 (delivered).
  await prisma.escalationNotification.create({
    data: {
      escalationId: escalation.id,
      attemptNumber: 1,
      channel: 'dashboard',
      recipientRole: 'on_duty_nurse',
      sentAt: submittedAt,
      delivered: true,
    },
  });
  // Attempt 2: ack window (15 min) elapsed → clinical lead notified at t-5.
  await prisma.escalationNotification.create({
    data: {
      escalationId: escalation.id,
      attemptNumber: 2,
      channel: 'dashboard',
      recipientRole: 'clinical_lead',
      sentAt: new Date(now.getTime() - 5 * 60 * 1000),
      delivered: true,
    },
  });

  return 1;
}

/**
 * DEMO-03: an urgent check-in from earlier today that was acknowledged and the
 * patient contacted, with a clinical outcome recorded. Status = contacted.
 */
async function seedContactedEscalation(
  prisma: PrismaClient,
  patientId: string,
  spec: DemoPatientSpec,
  now: Date,
): Promise<number> {
  const submittedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const checkIn = await prisma.checkIn.create({
    data: {
      patientId,
      submittedAt,
      recoveryDay: spec.recoveryDay,
      questionSetVersion: QUESTION_SET_VERSION,
      ruleVersion: RULE_VERSION,
      tierAssigned: Tier.urgent,
      withinClinicHours: true,
    },
  });

  await seedCheckInAnswers(prisma, checkIn.id, {
    'checkin.q1': '6',
    'checkin.q2': 'no',
    'checkin.q3': 'a_little_red',
    'checkin.q4': 'no',
    'checkin.q5': 'no',
    'checkin.q6': 'yes',
    'checkin.q7': 'yes',
  });

  const escalation = await prisma.escalation.create({
    data: {
      checkinId: checkIn.id,
      patientId,
      tier: Tier.urgent,
      status: EscalationStatus.contacted,
      outcomeCode: 'reviewed_advised_self_care',
      clinicalNote:
        'Reviewed by on-duty nurse and patient contacted by phone. Wound mildly red but healthy, no fever, tolerating fluids. Reassured, advised to continue plan and re-check tomorrow. No red flags.',
      createdAt: submittedAt,
    },
  });

  await prisma.escalationNotification.create({
    data: {
      escalationId: escalation.id,
      attemptNumber: 1,
      channel: 'dashboard',
      recipientRole: 'on_duty_nurse',
      sentAt: submittedAt,
      delivered: true,
    },
  });

  return 1;
}

async function seedCheckInAnswers(
  prisma: PrismaClient,
  checkinId: string,
  answers: Record<string, string>,
): Promise<void> {
  for (const [questionRef, answerValue] of Object.entries(answers)) {
    await prisma.checkInAnswer.create({
      data: { checkinId, questionRef, answerValue },
    });
  }
}

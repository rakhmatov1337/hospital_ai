import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { recoveryDay } from '../plans/recovery-day';

/**
 * MetricsService — the pilot's read-only analytics (design spec §9, plan Task 7).
 *
 * It NEVER writes and NEVER emits: each domain flow emits its own telemetry; this
 * service only READS the append-only `Event` table and the domain tables and
 * derives the pilot metrics from them. Tiering/judgement live nowhere here — these
 * are counts, ratios and medians over already-recorded categorical data.
 *
 * Two invariants the design pins and the tests assert:
 *   1. **Every metric returns its denominator** (spec D6) — a bare ratio is
 *      meaningless in a pilot, so each ratio ships `{ value, numerator, denominator }`.
 *   2. **Adherence excludes the future** — a task whose completion window has not
 *      yet closed is neither a success nor a failure; it is simply not yet assessable,
 *      so it is excluded from BOTH numerator and denominator.
 *
 * Readmissions/ED are reported as a **raw count only, never a rate** (spec §9).
 */

/** A ratio metric that always carries the numbers behind it. `value` is null when the denominator is 0. */
export interface Denominated {
  /** numerator / denominator, or null when denominator === 0 (undefined ratio). */
  value: number | null;
  numerator: number;
  denominator: number;
}

/** A median-of-durations metric, in milliseconds, with the sample size that produced it. */
export interface MedianDuration {
  /** Median duration in milliseconds, or null when no samples were available. */
  medianMs: number | null;
  /** How many escalations contributed a paired timestamp (the denominator). */
  denominator: number;
}

export interface AdherenceMetrics {
  overall: Denominated;
  byRecoveryDay: Record<number, Denominated>;
  byTaskType: Record<string, Denominated>;
}

export interface RetentionMetrics {
  /** Retained-at-day-N: still submitting check-ins by recovery day N. */
  day7: Denominated;
  day14: Denominated;
  day30: Denominated;
}

export interface EscalationMetrics {
  countByTier: Record<string, number>;
  total: number;
  timeToAcknowledge: MedianDuration;
  timeToContact: MedianDuration;
  breachCount: number;
}

export interface LanguageMetrics {
  /** patients per language (each a raw count + the population denominator). */
  patientsByLanguage: Record<string, number>;
  patientPopulation: number;
  /** adherence per language, each with its own denominator. */
  adherenceByLanguage: Record<string, Denominated>;
}

export interface SatisfactionMetrics {
  /** Mean of each 1–5 survey item, each with the number of non-null responses behind it. */
  q1Helpful: Denominated;
  q2Easy: Denominated;
  q3AdherenceSupport: Denominated;
  q4Recommend: Denominated;
  /** Total survey responses considered. Free text is never read here. */
  responseCount: number;
}

export interface EngagementMetrics {
  /** Average `app_opened` events per patient per week. */
  avgAppOpensPerPatientPerWeek: Denominated;
}

/**
 * Readmissions/ED — a RAW COUNT ONLY. Deliberately not a rate: with a pilot-sized
 * cohort a readmission "rate" would be dangerously noisy, so the count is reported
 * beside the population as context but is NEVER divided (design spec §9).
 */
export interface ReadmissionMetrics {
  count: number;
  patientPopulation: number;
  neverARate: true;
}

export interface MetricsReport {
  clinicId: string;
  generatedAt: string;
  adherence: AdherenceMetrics;
  retention: RetentionMetrics;
  checkInCompletion: Denominated;
  escalations: EscalationMetrics;
  language: LanguageMetrics;
  satisfaction: SatisfactionMetrics;
  engagement: EngagementMetrics;
  readmissions: ReadmissionMetrics;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for deterministic unit testing — no I/O)
// ---------------------------------------------------------------------------

/** The minimum shape adherence math needs from a Task row. */
export interface AdherenceTaskRow {
  taskType: string;
  status: string;
  onTime: boolean | null;
  windowClosesAt: Date;
  recoveryDay: number;
}

/** A task is assessable once its completion window has closed (strictly before now). */
export function isWindowClosed(task: { windowClosesAt: Date }, now: Date): boolean {
  return task.windowClosesAt.getTime() < now.getTime();
}

/** A task counts toward the numerator only if it was completed within its window. */
export function isCompletedOnTime(task: { status: string; onTime: boolean | null }): boolean {
  return task.status === 'completed' && task.onTime === true;
}

/**
 * Adherence = completed-on-time ÷ assigned-where-the-window-has-closed.
 * FUTURE tasks (window not yet closed) are excluded from both sides — they are not
 * yet assessable. `value` is null when nothing is assessable yet (denominator 0).
 */
export function computeAdherence(tasks: AdherenceTaskRow[], now: Date): Denominated {
  const closed = tasks.filter((t) => isWindowClosed(t, now));
  const onTime = closed.filter((t) => isCompletedOnTime(t));
  return denominated(onTime.length, closed.length);
}

/** Group adherence by an arbitrary key (recovery_day, task_type, …). */
export function groupAdherence<K extends string | number>(
  tasks: AdherenceTaskRow[],
  now: Date,
  keyFn: (t: AdherenceTaskRow) => K,
): Record<K, Denominated> {
  const buckets = new Map<K, AdherenceTaskRow[]>();
  for (const t of tasks) {
    const k = keyFn(t);
    const arr = buckets.get(k) ?? [];
    arr.push(t);
    buckets.set(k, arr);
  }
  const out = {} as Record<K, Denominated>;
  for (const [k, arr] of buckets) {
    out[k] = computeAdherence(arr, now);
  }
  return out;
}

/** Build a `{ value, numerator, denominator }` triple; value is null when denominator is 0. */
export function denominated(numerator: number, denominator: number): Denominated {
  return {
    value: denominator === 0 ? null : numerator / denominator,
    numerator,
    denominator,
  };
}

/** Median of a numeric sample; null for an empty sample. Averages the two middles on even counts. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Mean of a 1–5 survey item over its non-null responses, carrying the response count as denominator. */
export function meanScore(values: Array<number | null | undefined>): Denominated {
  const present = values.filter((v): v is number => typeof v === 'number');
  const sum = present.reduce((a, b) => a + b, 0);
  return denominated(sum, present.length);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Minimal row shapes read from the DB (kept local so the service is self-describing). */
interface PatientWithData {
  patientRef: string;
  language: string;
  dischargeDate: Date;
  tasks: AdherenceTaskRow[];
  checkIns: Array<{ recoveryDay: number }>;
  surveyResponses: Array<{
    q1Helpful: number | null;
    q2Easy: number | null;
    q3AdherenceSupport: number | null;
    q4Recommend: number | null;
  }>;
  escalations: Array<{ id: string; tier: string; status: string; createdAt: Date }>;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * Compute the full pilot metrics report for one clinic. `clinicId` is passed
   * explicitly (the controller supplies it from the authenticated staff token via
   * RequestContext) so the computation is testable without a request context.
   */
  async compute(clinicId: string): Promise<MetricsReport> {
    const now = this.clock.now();

    // clinic (for timezone) + clinic-scoped reads (tenancy extension injects clinic_id).
    const scoped = this.prisma.forClinic(clinicId) as unknown as PrismaService;
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    const timezone = clinic?.timezone ?? 'UTC';

    const patients = (await scoped.patient.findMany({
      include: {
        tasks: {
          select: {
            taskType: true,
            status: true,
            onTime: true,
            windowClosesAt: true,
            recoveryDay: true,
          },
        },
        checkIns: { select: { recoveryDay: true } },
        surveyResponses: {
          select: {
            q1Helpful: true,
            q2Easy: true,
            q3AdherenceSupport: true,
            q4Recommend: true,
          },
        },
        escalations: { select: { id: true, tier: true, status: true, createdAt: true } },
      },
    })) as unknown as PatientWithData[];

    const events = (await scoped.event.findMany({
      select: { eventName: true, patientRef: true, occurredAt: true },
    })) as Array<{ eventName: string; patientRef: string | null; occurredAt: Date }>;

    const allTasks = patients.flatMap((p) => p.tasks);

    return {
      clinicId,
      generatedAt: now.toISOString(),
      adherence: {
        overall: computeAdherence(allTasks, now),
        byRecoveryDay: groupAdherence(allTasks, now, (t) => t.recoveryDay),
        byTaskType: groupAdherence(allTasks, now, (t) => t.taskType),
      },
      retention: this.retention(patients, now, timezone),
      checkInCompletion: computeAdherence(
        allTasks.filter((t) => t.taskType === 'checkin'),
        now,
      ),
      escalations: this.escalations(patients, events),
      language: this.language(patients, now),
      satisfaction: this.satisfaction(patients),
      engagement: this.engagement(patients, events, now),
      readmissions: this.readmissions(patients, events),
    };
  }

  /**
   * Retention at day N = patients still submitting check-ins by recovery day N,
   * over the patients who have actually REACHED day N (so a day-3 patient is not
   * scored as "lost" at day 7 they simply have not got there). Denominator returned.
   */
  private retention(patients: PatientWithData[], now: Date, timezone: string): RetentionMetrics {
    const atDay = (n: number): Denominated => {
      const reached = patients.filter(
        (p) => recoveryDay(p.dischargeDate, now, timezone) >= n,
      );
      const retained = reached.filter((p) =>
        p.checkIns.some((c) => c.recoveryDay >= n),
      );
      return denominated(retained.length, reached.length);
    };
    return { day7: atDay(7), day14: atDay(14), day30: atDay(30) };
  }

  /**
   * Escalation counts by tier, breach count, and median time-to-acknowledge /
   * time-to-contact. Ack/contact instants come from the append-only Event stream
   * (`escalation_acknowledged` / `escalation_patient_contacted`, which carry only a
   * patientRef + occurredAt — zero clinical detail); each is paired to the escalation
   * it closed by matching patientRef and taking the earliest event at or after the
   * escalation's `created_at`. Both counts and breaches come from the authoritative
   * Escalation table.
   */
  private escalations(
    patients: PatientWithData[],
    events: Array<{ eventName: string; patientRef: string | null; occurredAt: Date }>,
  ): EscalationMetrics {
    const escalations = patients.flatMap((p) =>
      p.escalations.map((e) => ({ ...e, patientRef: p.patientRef })),
    );

    const countByTier: Record<string, number> = { emergency: 0, urgent: 0, routine: 0 };
    let breachCount = 0;
    for (const e of escalations) {
      countByTier[e.tier] = (countByTier[e.tier] ?? 0) + 1;
      if (e.status === 'breached') breachCount++;
    }

    const ackDeltas: number[] = [];
    const contactDeltas: number[] = [];
    for (const e of escalations) {
      const ack = this.firstEventAfter(events, 'escalation_acknowledged', e.patientRef, e.createdAt);
      if (ack !== null) ackDeltas.push(ack - e.createdAt.getTime());
      const contact = this.firstEventAfter(
        events,
        'escalation_patient_contacted',
        e.patientRef,
        e.createdAt,
      );
      if (contact !== null) contactDeltas.push(contact - e.createdAt.getTime());
    }

    return {
      countByTier,
      total: escalations.length,
      timeToAcknowledge: { medianMs: median(ackDeltas), denominator: ackDeltas.length },
      timeToContact: { medianMs: median(contactDeltas), denominator: contactDeltas.length },
      breachCount,
    };
  }

  /** Earliest occurredAt (ms) of `eventName` for `patientRef` at or after `since`, else null. */
  private firstEventAfter(
    events: Array<{ eventName: string; patientRef: string | null; occurredAt: Date }>,
    eventName: string,
    patientRef: string,
    since: Date,
  ): number | null {
    let best: number | null = null;
    for (const ev of events) {
      if (ev.eventName !== eventName || ev.patientRef !== patientRef) continue;
      const t = ev.occurredAt.getTime();
      if (t < since.getTime()) continue;
      if (best === null || t < best) best = t;
    }
    return best;
  }

  /** Patients per language + adherence per language (each with its denominator). */
  private language(patients: PatientWithData[], now: Date): LanguageMetrics {
    const patientsByLanguage: Record<string, number> = {};
    const tasksByLanguage = new Map<string, AdherenceTaskRow[]>();
    for (const p of patients) {
      patientsByLanguage[p.language] = (patientsByLanguage[p.language] ?? 0) + 1;
      const arr = tasksByLanguage.get(p.language) ?? [];
      arr.push(...p.tasks);
      tasksByLanguage.set(p.language, arr);
    }
    const adherenceByLanguage: Record<string, Denominated> = {};
    for (const [lang, tasks] of tasksByLanguage) {
      adherenceByLanguage[lang] = computeAdherence(tasks, now);
    }
    return {
      patientsByLanguage,
      patientPopulation: patients.length,
      adherenceByLanguage,
    };
  }

  /** Mean of each 1–5 survey item over its non-null responses. Free text is never touched. */
  private satisfaction(patients: PatientWithData[]): SatisfactionMetrics {
    const responses = patients.flatMap((p) => p.surveyResponses);
    return {
      q1Helpful: meanScore(responses.map((r) => r.q1Helpful)),
      q2Easy: meanScore(responses.map((r) => r.q2Easy)),
      q3AdherenceSupport: meanScore(responses.map((r) => r.q3AdherenceSupport)),
      q4Recommend: meanScore(responses.map((r) => r.q4Recommend)),
      responseCount: responses.length,
    };
  }

  /** Average `app_opened` events per patient per week over the observed window. */
  private engagement(
    patients: PatientWithData[],
    events: Array<{ eventName: string; patientRef: string | null; occurredAt: Date }>,
    now: Date,
  ): EngagementMetrics {
    const opens = events.filter((e) => e.eventName === 'app_opened');
    const patientCount = patients.length;
    if (patientCount === 0 || opens.length === 0) {
      return { avgAppOpensPerPatientPerWeek: denominated(0, patientCount) };
    }
    const earliest = opens.reduce(
      (min, e) => Math.min(min, e.occurredAt.getTime()),
      now.getTime(),
    );
    const weeks = Math.max(1, (now.getTime() - earliest) / MS_PER_WEEK);
    // numerator = opens per week; denominator = patients (opens/week/patient = value).
    const opensPerWeek = opens.length / weeks;
    return {
      avgAppOpensPerPatientPerWeek: denominated(opensPerWeek, patientCount),
    };
  }

  /**
   * Readmissions/ED — RAW COUNT ONLY, never a rate. No SP1/SP2 table records a
   * readmission, so the count is sourced defensively from any `readmission*` events
   * (0 in the MVP) and reported beside the population as context, never divided.
   */
  private readmissions(
    patients: PatientWithData[],
    events: Array<{ eventName: string }>,
  ): ReadmissionMetrics {
    const count = events.filter((e) => e.eventName.startsWith('readmission')).length;
    return { count, patientPopulation: patients.length, neverARate: true };
  }
}

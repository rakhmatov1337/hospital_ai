// A dummy DATABASE_URL keeps any transitive Prisma import happy; no live
// Postgres is used — every dependency of the job is a hand-built fake and time
// is driven by a FixedClock.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/db';

import { EscalationStatus, Tier } from '@hospital-ai/shared-types';
import { FixedClock } from '../common/clock';
import { EscalationLadderJob } from './ladder.job';
import { NotificationRequest } from './notification-channel';

// Tashkent is UTC+5 (no DST). Working days are all days, so only time-of-day
// controls in/out-of-hours.
const IN_HOURS = new Date('2026-06-17T07:00:00Z'); // 12:00 Tashkent → in hours
const OUT_HOURS = new Date('2026-06-17T22:00:00Z'); // 03:00 Tashkent → out of hours

interface FakeClinic {
  id: string;
  timezone: string;
  workingHours: string;
  workingDays: string;
  notifyMinutes: number;
  ackMinutes: number;
  breachMinutes: number;
}

interface FakeNotification {
  attemptNumber: number;
  recipientRole: string;
  sentAt: Date;
}

interface FakeEscalation {
  id: string;
  tier: string;
  status: string;
  createdAt: Date;
  notifications: FakeNotification[];
  patient: { patientRef: string; clinic: FakeClinic };
}

/** The 0/15/30 ladder (canonical thresholds) so assertions are clean. */
function clinic(overrides: Partial<FakeClinic> = {}): FakeClinic {
  return {
    id: 'clinic-1',
    timezone: 'Asia/Tashkent',
    workingHours: '09:00-18:00',
    workingDays: 'Mon-Sun',
    notifyMinutes: 0,
    ackMinutes: 15,
    breachMinutes: 30,
    ...overrides,
  };
}

/** A test harness: the job wired to in-memory fakes over a shared store. */
function harness(start: Date) {
  const store: FakeEscalation[] = [];
  const clock = new FixedClock(start);

  const sent: NotificationRequest[] = [];
  const channel = {
    async send(req: NotificationRequest) {
      sent.push({ ...req });
      const esc = store.find((e) => e.id === req.escalationId);
      esc?.notifications.push({
        attemptNumber: req.attemptNumber,
        recipientRole: req.recipientRole,
        sentAt: clock.now(),
      });
      return { delivered: true };
    },
  };

  const advanced: Array<{ id: string; target: string }> = [];
  const repo = {
    async advanceStatus(id: string, target: EscalationStatus) {
      advanced.push({ id, target });
      const esc = store.find((e) => e.id === id);
      if (esc) esc.status = target;
      return esc;
    },
  };

  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const telemetry = {
    async emit(name: string, payload: Record<string, unknown>) {
      events.push({ name, payload });
    },
  };

  const prisma = {
    escalation: {
      async findMany({ where }: { where: { status: string } }) {
        return store.filter((e) => e.status === where.status);
      },
    },
  };

  const job = new EscalationLadderJob(
    prisma as never,
    repo as never,
    channel as never,
    telemetry as never,
    clock,
  );

  function add(esc: Partial<FakeEscalation> & { tier: string }): FakeEscalation {
    const full: FakeEscalation = {
      id: esc.id ?? `esc-${store.length + 1}`,
      tier: esc.tier,
      status: esc.status ?? EscalationStatus.new,
      createdAt: esc.createdAt ?? clock.now(),
      notifications: esc.notifications ?? [],
      patient: esc.patient ?? { patientRef: 'PT-0001', clinic: clinic() },
    };
    store.push(full);
    return full;
  }

  return { job, clock, store, sent, advanced, events, add };
}

const roles = (sent: NotificationRequest[]) => sent.map((s) => s.recipientRole);
const attempts = (sent: NotificationRequest[]) => sent.map((s) => s.attemptNumber);

describe('EscalationLadderJob (deterministic ladder, clock-driven)', () => {
  it('unacked urgent: on-duty@0 → backup@15 → clinic-head@30 + breach', async () => {
    const h = harness(IN_HOURS);
    const esc = h.add({ id: 'esc-1', tier: Tier.urgent, createdAt: IN_HOURS });

    await h.job.runOnce(); // t=0
    expect(roles(h.sent)).toEqual(['on_duty']);
    expect(esc.status).toBe(EscalationStatus.new);

    h.clock.advanceMinutes(15); // t=15
    await h.job.runOnce();
    expect(roles(h.sent)).toEqual(['on_duty', 'backup']);
    expect(esc.status).toBe(EscalationStatus.new);

    h.clock.advanceMinutes(15); // t=30
    await h.job.runOnce();
    expect(roles(h.sent)).toEqual(['on_duty', 'backup', 'clinic_head']);
    expect(attempts(h.sent)).toEqual([1, 2, 3]);
    expect(esc.status).toBe(EscalationStatus.breached);

    expect(h.advanced).toContainEqual({ id: 'esc-1', target: EscalationStatus.breached });
    expect(h.events.map((e) => e.name)).toContain('escalation_breached');
    // escalation_notified payload is categorical: attempt + recipient_role only.
    const notified = h.events.find((e) => e.name === 'escalation_notified');
    expect(Object.keys(notified!.payload).sort()).toEqual(['attempt', 'recipient_role']);
  });

  it('does not re-notify a rung already placed on a prior tick', async () => {
    const h = harness(IN_HOURS);
    h.add({ id: 'esc-1', tier: Tier.urgent, createdAt: IN_HOURS });

    await h.job.runOnce(); // attempt 1
    await h.job.runOnce(); // same minute — no duplicate
    expect(h.sent).toHaveLength(1);
  });

  it('acknowledge halts the ladder: no breach at 30 min', async () => {
    const h = harness(IN_HOURS);
    const esc = h.add({ id: 'esc-1', tier: Tier.urgent, createdAt: IN_HOURS });

    await h.job.runOnce(); // t=0 → on_duty
    h.clock.advanceMinutes(15);
    await h.job.runOnce(); // t=15 → backup

    // Staff acknowledges — the ladder must stop here.
    esc.status = EscalationStatus.acknowledged;

    h.clock.advanceMinutes(15);
    await h.job.runOnce(); // t=30 — skipped (only `new` escalations advance)

    expect(roles(h.sent)).toEqual(['on_duty', 'backup']);
    expect(esc.status).toBe(EscalationStatus.acknowledged);
    expect(h.events.map((e) => e.name)).not.toContain('escalation_breached');
  });

  it('out of hours: a non-emergency places NO call (dashboard only)', async () => {
    const h = harness(OUT_HOURS);
    const esc = h.add({
      id: 'esc-1',
      tier: Tier.urgent,
      createdAt: OUT_HOURS,
      patient: { patientRef: 'PT-0001', clinic: clinic() },
    });

    await h.job.runOnce(); // t=0
    h.clock.advanceMinutes(30);
    await h.job.runOnce(); // t=30 — still out of hours

    expect(h.sent).toHaveLength(0);
    expect(esc.status).toBe(EscalationStatus.new); // never breached out of hours
  });

  it('out of hours: EMERGENCY notifications are unaffected', async () => {
    const h = harness(OUT_HOURS);
    h.add({
      id: 'esc-1',
      tier: Tier.emergency,
      createdAt: OUT_HOURS,
      patient: { patientRef: 'PT-0001', clinic: clinic() },
    });

    await h.job.runOnce(); // t=0
    expect(roles(h.sent)).toEqual(['on_duty']);
  });

  it('a notification payload carries ZERO clinical detail (only ref/role/attempt)', async () => {
    const h = harness(IN_HOURS);
    h.add({
      id: 'esc-1',
      tier: Tier.urgent,
      createdAt: IN_HOURS,
      patient: { patientRef: 'PT-ANON-42', clinic: clinic() },
    });

    await h.job.runOnce();
    h.clock.advanceMinutes(30);
    await h.job.runOnce();

    expect(h.sent.length).toBeGreaterThan(0);
    for (const req of h.sent) {
      // The ONLY keys — no tier, no answers, no symptoms, no name.
      expect(Object.keys(req).sort()).toEqual([
        'attemptNumber',
        'escalationId',
        'patientRef',
        'recipientRole',
      ]);
      const blob = JSON.stringify(req).toLowerCase();
      expect(blob).not.toContain('pain');
      expect(blob).not.toContain('wound');
      expect(blob).not.toContain('urgent');
      expect(blob).not.toContain('emergency');
    }
  });

  it('processes multiple clinics/escalations in one pass', async () => {
    const h = harness(IN_HOURS);
    h.add({ id: 'a', tier: Tier.urgent, createdAt: IN_HOURS });
    h.add({ id: 'b', tier: Tier.emergency, createdAt: IN_HOURS });

    await h.job.runOnce();
    expect(h.sent.map((s) => s.escalationId).sort()).toEqual(['a', 'b']);
  });
});

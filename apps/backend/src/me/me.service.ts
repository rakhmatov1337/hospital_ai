import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { CarePlan } from '../entities/care-plan.entity';
import { CarePlanItem } from '../entities/care-plan-item.entity';
import { ItemCompletion } from '../entities/item-completion.entity';
import { CheckIn } from '../entities/check-in.entity';
import { Complaint } from '../entities/complaint.entity';
import { CompleteItemDto, CheckInDto, ComplaintDto } from './me.dto';
import { mastra } from '../ai/mastra';
import { dailyCheckInWorkflow } from '../ai/mastra/workflows/daily-checkin.workflow';

const DIET_TIPS = [
  {
    icon: 'protein',
    title: 'High Protein',
    text: 'Chicken, fish, eggs, legumes — aim for 1.2g/kg body weight to support tissue repair.',
  },
  {
    icon: 'leaf',
    title: 'Anti-inflammatory',
    text: 'Broccoli, berries, leafy greens, turmeric.',
  },
  {
    icon: 'water',
    title: 'Hydration',
    text: '8–10 glasses of water daily to support healing and prevent constipation.',
  },
  {
    icon: 'avoid',
    title: 'Avoid',
    text: 'Alcohol, processed foods, excess sodium.',
  },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.floor((b - a) / 86_400_000);
}

export interface ScheduleEntry {
  itemId: string;
  type: string;
  title: string;
  description: string;
  scheduleTime: string;
  dosage?: string | null;
  frequency?: string | null;
  completed: boolean;
}

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(CarePlan) private readonly plans: Repository<CarePlan>,
    @InjectRepository(CarePlanItem)
    private readonly items: Repository<CarePlanItem>,
    @InjectRepository(ItemCompletion)
    private readonly completions: Repository<ItemCompletion>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    @InjectRepository(Complaint)
    private readonly complaints: Repository<Complaint>,
  ) {}

  private async getPatient(patientId: string): Promise<Patient> {
    const p = await this.patients.findOne({ where: { id: patientId } });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  /** Care-plan items active on a given post-op day (latest ACTIVE plan). */
  private async activeItems(
    patientId: string,
    postOpDay: number,
  ): Promise<CarePlanItem[]> {
    const plan = await this.plans.findOne({
      where: { patientId, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
    if (!plan) return [];
    const items = await this.items.find({
      where: { carePlanId: plan.id, active: true },
    });
    return items.filter((i) => {
      if (postOpDay < i.startDay) return false;
      if (i.durationDays != null && postOpDay >= i.startDay + i.durationDays)
        return false;
      return true;
    });
  }

  /** Expand active items into per-time schedule entries with completion state. */
  private async schedule(
    patientId: string,
    date: string,
    postOpDay: number,
    filterType?: string,
  ): Promise<ScheduleEntry[]> {
    const items = await this.activeItems(patientId, postOpDay);
    const done = await this.completions.find({ where: { patientId, date } });
    const isDone = (itemId: string, time: string) =>
      done.some(
        (d) => d.itemId === itemId && d.scheduleTime === time && d.completed,
      );

    const entries: ScheduleEntry[] = [];
    for (const i of items) {
      if (filterType && i.type !== filterType) continue;
      const times = i.scheduleTimes?.length ? i.scheduleTimes : [''];
      for (const t of times) {
        entries.push({
          itemId: i.id,
          type: i.type,
          title: i.title,
          description: i.description,
          scheduleTime: t,
          dosage: i.dosage,
          frequency: i.frequency,
          completed: isDone(i.id, t),
        });
      }
    }
    entries.sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime));
    return entries;
  }

  async dashboard(patientId: string) {
    const p = await this.getPatient(patientId);
    const postOpDay = Math.max(0, daysBetween(p.surgeryDate, today()));
    const totalDays = p.surgeryType?.avgRecoveryDays ?? 42;
    const progressPct = Math.min(100, Math.round((postOpDay / totalDays) * 100));
    const sched = await this.schedule(patientId, today(), postOpDay);
    const recent = await this.checkIns.find({
      where: { patientId },
      order: { createdAt: 'DESC' },
      take: 7,
    });
    const latestPain = recent[0]?.painLevel ?? null;

    return {
      patient: {
        id: p.id,
        fullName: p.user?.fullName,
        status: p.status,
        recoveryScore: p.recoveryScore,
      },
      recovery: { postOpDay, totalDays, progressPct },
      todaySchedule: sched.slice(0, 6),
      weeklyVitality: {
        latestPain,
        painTrend: recent
          .map((c) => ({ date: c.date, pain: c.painLevel }))
          .reverse(),
      },
    };
  }

  async checklist(patientId: string, date?: string) {
    const p = await this.getPatient(patientId);
    const d = date ?? today();
    const postOpDay = Math.max(0, daysBetween(p.surgeryDate, d));
    const entries = await this.schedule(patientId, d, postOpDay);
    const completed = entries.filter((e) => e.completed).length;
    return { date: d, completed, total: entries.length, items: entries };
  }

  async completeItem(patientId: string, itemId: string, dto: CompleteItemDto) {
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item || item.patientId !== patientId) {
      throw new NotFoundException('Care plan item not found');
    }
    const date = today();
    const scheduleTime = dto.scheduleTime ?? '';
    const completed = dto.completed ?? true;
    let row = await this.completions.findOne({
      where: { itemId, date, scheduleTime },
    });
    if (!row) {
      row = this.completions.create({ itemId, patientId, date, scheduleTime });
    }
    row.completed = completed;
    await this.completions.save(row);
    return { itemId, date, scheduleTime, completed };
  }

  async medications(patientId: string, date?: string) {
    const p = await this.getPatient(patientId);
    const d = date ?? today();
    const postOpDay = Math.max(0, daysBetween(p.surgeryDate, d));
    const entries = await this.schedule(patientId, d, postOpDay, 'MEDICATION');
    const completed = entries.filter((e) => e.completed).length;
    return { date: d, completed, total: entries.length, medications: entries };
  }

  async diet(patientId: string) {
    const p = await this.getPatient(patientId);
    const postOpDay = Math.max(0, daysBetween(p.surgeryDate, today()));
    const items = await this.activeItems(patientId, postOpDay);
    const prescribed = items
      .filter((i) => i.type === 'DIET')
      .map((i) => ({ title: i.title, description: i.description }));
    return { prescribed, tips: DIET_TIPS };
  }

  /** Record a daily check-in and run the AI risk workflow (alerts + score). */
  async createCheckIn(patientId: string, dto: CheckInDto) {
    const p = await this.getPatient(patientId);
    const date = today();
    const recoveryDay = Math.max(0, daysBetween(p.surgeryDate, date));
    const checkIn = await this.checkIns.save(
      this.checkIns.create({
        patientId,
        date,
        painLevel: dto.painLevel,
        temperature: dto.temperature ?? null,
        symptoms: dto.symptoms,
        mood: dto.mood ?? null,
        bpm: dto.bpm ?? null,
        spo2: dto.spo2 ?? null,
        source: 'MANUAL',
      }),
    );

    void mastra; // ensure the Mastra instance is constructed + workflow wired
    const run = await dailyCheckInWorkflow.createRun();
    const result = await run.start({
      inputData: {
        checkInId: checkIn.id,
        patientId,
        painLevel: dto.painLevel,
        temperature: dto.temperature ?? null,
        symptoms: dto.symptoms,
        mood: dto.mood ?? null,
        recoveryDay,
      },
    });

    return {
      checkIn: { id: checkIn.id, date, painLevel: dto.painLevel },
      risk: result.status === 'success' ? result.result : null,
    };
  }

  /** Submit an anonymous complaint ("Anonim shikoyat"). */
  async createComplaint(patientId: string, dto: ComplaintDto) {
    const p = await this.getPatient(patientId);
    const row = await this.complaints.save(
      this.complaints.create({
        hospitalId: p.hospitalId,
        patientId, // internal only — never returned to staff
        category: dto.category,
        description: dto.description,
        urgency: dto.urgency,
        status: 'NEW',
      }),
    );
    return {
      id: row.id,
      category: row.category,
      urgency: row.urgency,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  /** The patient's own submitted complaints. */
  async listComplaints(patientId: string) {
    const rows = await this.complaints.find({
      where: { patientId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      urgency: r.urgency,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async profile(patientId: string) {
    const p = await this.getPatient(patientId);
    const postOpDay = Math.max(0, daysBetween(p.surgeryDate, today()));
    const totalDays = p.surgeryType?.avgRecoveryDays ?? 42;
    return {
      id: p.id,
      publicId: p.publicId,
      fullName: p.user?.fullName,
      email: p.user?.email,
      phone: p.user?.phone,
      age: p.age,
      status: p.status,
      accessCode: p.accessCode,
      surgery: {
        type: p.surgeryType?.name,
        date: p.surgeryDate,
        postOpDay,
        totalDays,
        progressPct: Math.min(100, Math.round((postOpDay / totalDays) * 100)),
      },
    };
  }
}

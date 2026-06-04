import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { Alert } from '../entities/alert.entity';
import { CheckIn } from '../entities/check-in.entity';
import { RecoveryPoint } from '../entities/recovery-point.entity';
import { postOpDay } from '../common/dates';
import { generateAdvisor } from '../ai/advisor/advisor.service';

@Injectable()
export class DoctorService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(CheckIn) private readonly checkIns: Repository<CheckIn>,
    @InjectRepository(RecoveryPoint)
    private readonly points: Repository<RecoveryPoint>,
  ) {}

  private async patientIds(doctorId: string): Promise<string[]> {
    const rows = await this.patients.find({ where: { doctorId } });
    return rows.map((p) => p.id);
  }

  async dashboard(doctorId: string) {
    const all = await this.patients.find({
      where: { doctorId },
      order: { updatedAt: 'DESC' },
    });
    const total = all.length;
    const atRisk = all.filter((p) => p.status === 'AT_RISK').length;
    const recovering = all.filter((p) => p.status === 'RECOVERING').length;
    const unreadAlerts = await this.alerts.count({
      where: { doctorId, status: 'UNREAD' },
    });

    const recent = [];
    for (const p of all.slice(0, 5)) {
      const last = await this.checkIns.findOne({
        where: { patientId: p.id },
        order: { createdAt: 'DESC' },
      });
      recent.push({
        id: p.id,
        publicId: p.publicId,
        fullName: p.user?.fullName,
        status: p.status,
        recoveryScore: p.recoveryScore,
        surgeryType: p.surgeryType?.name,
        postOpDay: postOpDay(p.surgeryDate),
        lastCheckIn: last
          ? {
              date: last.date,
              painLevel: last.painLevel,
              bpm: last.bpm,
              spo2: last.spo2,
            }
          : null,
      });
    }

    return {
      stats: { total, atRisk, recovering, unreadAlerts },
      recentPatients: recent,
    };
  }

  async analytics(doctorId: string) {
    const ids = await this.patientIds(doctorId);
    let chart: { date: string; avgScore: number }[] = [];
    if (ids.length) {
      const pts = await this.points.find({ where: { patientId: In(ids) } });
      const byDate = new Map<string, number[]>();
      for (const p of pts) {
        if (!byDate.has(p.date)) byDate.set(p.date, []);
        byDate.get(p.date)!.push(p.score);
      }
      chart = [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7)
        .map(([date, scores]) => ({
          date,
          avgScore: Math.round(scores.reduce((s, n) => s + n, 0) / scores.length),
        }));
    }

    const advisor = await generateAdvisor(await this.cohortSummary(doctorId));
    const todayScore = chart.at(-1)?.avgScore ?? null;
    const prevScore = chart.at(-2)?.avgScore ?? null;

    return {
      recoveryChart: chart,
      todayScore,
      deltaVsYesterday:
        todayScore != null && prevScore != null ? todayScore - prevScore : null,
      avgRecoveryScore: chart.length
        ? Math.round(chart.reduce((s, c) => s + c.avgScore, 0) / chart.length)
        : null,
      advisor,
    };
  }

  private async cohortSummary(doctorId: string): Promise<string> {
    const all = await this.patients.find({ where: { doctorId } });
    const lines: string[] = [];
    for (const p of all.slice(0, 12)) {
      const recent = await this.checkIns.find({
        where: { patientId: p.id },
        order: { createdAt: 'DESC' },
        take: 3,
      });
      const trend = recent
        .map((c) => `pain ${c.painLevel}${c.temperature ? `/temp ${c.temperature}` : ''}`)
        .join(', ');
      lines.push(
        `- ${p.user?.fullName ?? p.publicId} (${p.surgeryType?.name ?? 'surgery'}, day ${postOpDay(
          p.surgeryDate,
        )}, status ${p.status}, recovery ${p.recoveryScore}). Recent: ${trend || 'no check-ins'}.`,
      );
    }
    return lines.join('\n') || 'No patients yet.';
  }

  // ---- Alerts ----
  async listAlerts(doctorId: string) {
    const rows = await this.alerts.find({
      where: { doctorId },
      order: { createdAt: 'DESC' },
    });
    const rank = (s: string) => (s === 'UNREAD' ? 0 : s === 'READ' ? 1 : 2);
    return rows.sort((a, b) => rank(a.status) - rank(b.status));
  }

  async markRead(doctorId: string, id: string) {
    const a = await this.alerts.findOne({ where: { id } });
    if (!a || a.doctorId !== doctorId)
      throw new NotFoundException('Alert not found');
    a.status = 'READ';
    await this.alerts.save(a);
    return { id: a.id, status: a.status };
  }

  async dismiss(doctorId: string, id: string) {
    const a = await this.alerts.findOne({ where: { id } });
    if (!a || a.doctorId !== doctorId)
      throw new NotFoundException('Alert not found');
    a.status = 'DISMISSED';
    await this.alerts.save(a);
    return { id: a.id, status: a.status };
  }
}

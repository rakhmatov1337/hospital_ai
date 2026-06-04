import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Hospital } from '../entities/hospital.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { KbDocument } from '../entities/kb-document.entity';
import { AiInteraction } from '../entities/ai-interaction.entity';
import { ScoreLog } from '../entities/score-log.entity';
import {
  CreateHospitalDto,
  CreateSurgeryTypeDto,
  UploadKbDto,
} from './superadmin.dto';
import { extractText } from '../ai/mastra/ingestion';
import { kbIndexFor } from '../ai/mastra/vectors';
import { mastra } from '../ai/mastra';
import { kbIngestionWorkflow } from '../ai/mastra/workflows/kb-ingestion.workflow';

export interface UploadedDoc {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class SuperadminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Hospital) private readonly hospitals: Repository<Hospital>,
    @InjectRepository(SurgeryType)
    private readonly surgeryTypes: Repository<SurgeryType>,
    @InjectRepository(KbDocument)
    private readonly kbDocs: Repository<KbDocument>,
    @InjectRepository(AiInteraction)
    private readonly interactions: Repository<AiInteraction>,
    @InjectRepository(ScoreLog)
    private readonly scoreLogs: Repository<ScoreLog>,
  ) {}

  // ---- hospitals ----
  async createHospital(superadminId: string, dto: CreateHospitalDto) {
    const hospital = await this.hospitals.save(
      this.hospitals.create({
        name: dto.name,
        address: dto.address ?? null,
        city: dto.city ?? null,
        status: 'ACTIVE',
        createdByUserId: superadminId,
      }),
    );
    const admin = await this.users.save(
      this.users.create({
        fullName: dto.adminFullName,
        email: dto.adminEmail,
        passwordHash: bcrypt.hashSync(dto.adminPassword, 10),
        role: 'HOSPITAL_ADMIN',
        hospitalId: hospital.id,
      }),
    );
    return {
      hospital,
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName },
    };
  }

  async listHospitals() {
    const rows = await this.hospitals.find({ order: { createdAt: 'DESC' } });
    const out = [];
    for (const h of rows) {
      out.push({
        ...h,
        doctors: await this.users.count({
          where: { hospitalId: h.id, role: 'DOCTOR' },
        }),
        patients: await this.users.count({
          where: { hospitalId: h.id, role: 'PATIENT' },
        }),
      });
    }
    return out;
  }

  async getHospital(id: string) {
    const h = await this.hospitals.findOne({ where: { id } });
    if (!h) throw new NotFoundException('Hospital not found');
    return h;
  }

  async updateHospital(id: string, patch: Partial<Hospital>) {
    const h = await this.getHospital(id);
    Object.assign(h, {
      name: patch.name ?? h.name,
      address: patch.address ?? h.address,
      city: patch.city ?? h.city,
      status: patch.status ?? h.status,
    });
    return this.hospitals.save(h);
  }

  // ---- surgery types ----
  listSurgeryTypes() {
    return this.surgeryTypes.find();
  }

  createSurgeryType(dto: CreateSurgeryTypeDto) {
    return this.surgeryTypes.save(
      this.surgeryTypes.create({
        name: dto.name,
        nameRu: dto.nameRu ?? null,
        nameUz: dto.nameUz ?? null,
        category: dto.category ?? null,
        avgRecoveryDays: dto.avgRecoveryDays ?? 21,
        kbIndex: dto.kbIndex ?? null,
      }),
    );
  }

  // ---- KB documents (AI training) ----
  async uploadKb(superadminId: string, file: UploadedDoc, dto: UploadKbDto) {
    const surgery = await this.surgeryTypes.findOne({
      where: { id: dto.surgeryTypeId },
    });
    if (!surgery) throw new NotFoundException('Surgery type not found');
    const indexName = kbIndexFor(surgery.kbIndex);

    let doc = await this.kbDocs.save(
      this.kbDocs.create({
        surgeryTypeId: surgery.id,
        indexName,
        title: dto.title,
        source: dto.source ?? null,
        license: dto.license ?? null,
        fileName: file?.originalname ?? null,
        uploadedByUserId: superadminId,
        status: 'INGESTING',
        chunkCount: 0,
      }),
    );

    try {
      const text = await extractText(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      void mastra;
      const run = await kbIngestionWorkflow.createRun();
      const res = await run.start({
        inputData: {
          text,
          indexName,
          title: dto.title,
          source: dto.source,
        },
      });
      const chunkCount =
        res.status === 'success' ? res.result.chunkCount : 0;
      doc.status = chunkCount > 0 ? 'INGESTED' : 'FAILED';
      doc.chunkCount = chunkCount;
      if (chunkCount === 0) doc.error = 'No chunks produced';
      // persist surgery kbIndex if it was unset
      if (!surgery.kbIndex) {
        surgery.kbIndex = indexName;
        await this.surgeryTypes.save(surgery);
      }
    } catch (e) {
      doc.status = 'FAILED';
      doc.error = e instanceof Error ? e.message : 'Ingestion failed';
    }
    doc = await this.kbDocs.save(doc);
    return doc;
  }

  listKb() {
    return this.kbDocs.find({ order: { createdAt: 'DESC' } });
  }

  async getKb(id: string) {
    const d = await this.kbDocs.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }

  async deleteKb(id: string) {
    const d = await this.getKb(id);
    await this.kbDocs.remove(d);
    return { deleted: true };
  }

  // ---- AI audit ----
  listInteractions(limit = 50) {
    return this.interactions.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Aggregate AI quality metrics for the superadmin dashboard. */
  async metrics() {
    const logs = await this.scoreLogs.find();
    const byScorer: Record<string, { avg: number; count: number }> = {};
    const acc: Record<string, { sum: number; count: number }> = {};
    for (const l of logs) {
      acc[l.scorer] ??= { sum: 0, count: 0 };
      acc[l.scorer].sum += l.score;
      acc[l.scorer].count += 1;
    }
    for (const [k, v] of Object.entries(acc)) {
      byScorer[k] = {
        avg: Math.round((v.sum / v.count) * 100) / 100,
        count: v.count,
      };
    }

    const interactions = await this.interactions.find();
    const withConf = interactions.filter((i) => i.confidence != null);
    const avgConfidence = withConf.length
      ? Math.round(
          (withConf.reduce((s, i) => s + (i.confidence ?? 0), 0) /
            withConf.length) *
            100,
        ) / 100
      : null;
    const fallbackRate = interactions.length
      ? Math.round(
          (interactions.filter((i) => i.fallbackUsed).length /
            interactions.length) *
            100,
        ) / 100
      : 0;
    const byAgent: Record<string, number> = {};
    for (const i of interactions) byAgent[i.agent] = (byAgent[i.agent] ?? 0) + 1;

    return {
      scorers: byScorer,
      interactions: {
        total: interactions.length,
        byAgent,
        avgConfidence,
        fallbackRate,
      },
    };
  }
}

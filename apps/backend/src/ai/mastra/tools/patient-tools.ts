import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getAiDataSource } from '../db';
import { Patient } from '../../../entities/patient.entity';
import { CarePlan } from '../../../entities/care-plan.entity';
import { CarePlanItem } from '../../../entities/care-plan-item.entity';
import { CheckIn } from '../../../entities/check-in.entity';

/** RequestContext key the chat service sets so tools read the right patient. */
export const PATIENT_CTX_KEY = 'patientId';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePatientId(inputData: any, context: any): string {
  const fromCtx = context?.requestContext?.get?.(PATIENT_CTX_KEY) as
    | string
    | undefined;
  const id = fromCtx ?? inputData?.patientId;
  if (!id) throw new Error('No patient in context');
  return id;
}

function postOpDay(surgeryDate: string): number {
  const a = new Date(surgeryDate + 'T00:00:00Z').getTime();
  const b = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

export const getPatientProfileTool = createTool({
  id: 'getPatientProfile',
  description:
    "Get the current patient's demographics, surgery type, surgery date, post-op day, and recovery status.",
  inputSchema: z.object({
    patientId: z.string().optional(),
  }),
  outputSchema: z.object({
    fullName: z.string().nullable(),
    surgeryType: z.string().nullable(),
    surgeryDate: z.string(),
    postOpDay: z.number(),
    status: z.string(),
    recoveryScore: z.number(),
  }),
  execute: async (inputData, context) => {
    const id = resolvePatientId(inputData, context);
    const ds = await getAiDataSource();
    const p = await ds.getRepository(Patient).findOne({ where: { id } });
    if (!p) throw new Error('Patient not found');
    return {
      fullName: p.user?.fullName ?? null,
      surgeryType: p.surgeryType?.name ?? null,
      surgeryDate: p.surgeryDate,
      postOpDay: postOpDay(p.surgeryDate),
      status: p.status,
      recoveryScore: p.recoveryScore,
    };
  },
});

export const getCarePlanTool = createTool({
  id: 'getCarePlan',
  description:
    "Get the current patient's active care plan items (medications, exercises, diet, restrictions).",
  inputSchema: z.object({ patientId: z.string().optional() }),
  outputSchema: z.object({
    items: z.array(
      z.object({
        type: z.string(),
        title: z.string(),
        description: z.string(),
        dosage: z.string().nullable().optional(),
        frequency: z.string().nullable().optional(),
        scheduleTimes: z.array(z.string()).optional(),
      }),
    ),
  }),
  execute: async (inputData, context) => {
    const id = resolvePatientId(inputData, context);
    const ds = await getAiDataSource();
    const plan = await ds.getRepository(CarePlan).findOne({
      where: { patientId: id, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
    if (!plan) return { items: [] };
    const items = await ds
      .getRepository(CarePlanItem)
      .find({ where: { carePlanId: plan.id, active: true } });
    return {
      items: items.map((i) => ({
        type: i.type,
        title: i.title,
        description: i.description,
        dosage: i.dosage,
        frequency: i.frequency,
        scheduleTimes: i.scheduleTimes,
      })),
    };
  },
});

export const getMedicationScheduleTool = createTool({
  id: 'getMedicationSchedule',
  description:
    "Get the current patient's medications with dosage, frequency, and daily times.",
  inputSchema: z.object({ patientId: z.string().optional() }),
  outputSchema: z.object({
    medications: z.array(
      z.object({
        title: z.string(),
        dosage: z.string().nullable().optional(),
        frequency: z.string().nullable().optional(),
        scheduleTimes: z.array(z.string()).optional(),
        description: z.string(),
      }),
    ),
  }),
  execute: async (inputData, context) => {
    const id = resolvePatientId(inputData, context);
    const ds = await getAiDataSource();
    const plan = await ds.getRepository(CarePlan).findOne({
      where: { patientId: id, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
    if (!plan) return { medications: [] };
    const items = await ds.getRepository(CarePlanItem).find({
      where: { carePlanId: plan.id, type: 'MEDICATION', active: true },
    });
    return {
      medications: items.map((i) => ({
        title: i.title,
        dosage: i.dosage,
        frequency: i.frequency,
        scheduleTimes: i.scheduleTimes,
        description: i.description,
      })),
    };
  },
});

export const getRecentCheckInsTool = createTool({
  id: 'getRecentCheckIns',
  description:
    "Get the current patient's most recent daily check-ins (pain, temperature, symptoms) to understand their recent trend.",
  inputSchema: z.object({
    patientId: z.string().optional(),
    limit: z.number().optional(),
  }),
  outputSchema: z.object({
    checkIns: z.array(
      z.object({
        date: z.string(),
        painLevel: z.number(),
        temperature: z.number().nullable().optional(),
        symptoms: z.array(z.string()).optional(),
        riskLevel: z.string().nullable().optional(),
      }),
    ),
  }),
  execute: async (inputData, context) => {
    const id = resolvePatientId(inputData, context);
    const ds = await getAiDataSource();
    const rows = await ds.getRepository(CheckIn).find({
      where: { patientId: id },
      order: { createdAt: 'DESC' },
      take: inputData?.limit ?? 5,
    });
    return {
      checkIns: rows.map((c) => ({
        date: c.date,
        painLevel: c.painLevel,
        temperature: c.temperature,
        symptoms: c.symptoms,
        riskLevel: c.riskLevel,
      })),
    };
  },
});

export const patientTools = {
  getPatientProfileTool,
  getCarePlanTool,
  getMedicationScheduleTool,
  getRecentCheckInsTool,
};

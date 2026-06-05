import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { q, one, parseArray } from '../db';

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
  const b = new Date(
    new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
  ).getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

async function activePlanId(patientId: string): Promise<string | null> {
  const plan = await one<{ id: string }>(
    `SELECT id FROM care_plans WHERE "patientId"=$1 AND status='ACTIVE' ORDER BY "createdAt" DESC LIMIT 1`,
    [patientId],
  );
  return plan?.id ?? null;
}

export const getPatientProfileTool = createTool({
  id: 'getPatientProfile',
  description:
    "Get the current patient's demographics, surgery type, surgery date, post-op day, and recovery status.",
  inputSchema: z.object({ patientId: z.string().optional() }),
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
    const row = await one<{
      fullname: string | null;
      surgerytype: string | null;
      surgerydate: string;
      status: string;
      recoveryscore: number;
    }>(
      `SELECT u."fullName" AS fullname, st.name AS surgerytype,
              to_char(p."surgeryDate",'YYYY-MM-DD') AS surgerydate,
              p.status, p."recoveryScore" AS recoveryscore
       FROM patients p
       JOIN users u ON u.id = p."userId"
       JOIN surgery_types st ON st.id = p."surgeryTypeId"
       WHERE p.id = $1`,
      [id],
    );
    if (!row) throw new Error('Patient not found');
    return {
      fullName: row.fullname,
      surgeryType: row.surgerytype,
      surgeryDate: row.surgerydate,
      postOpDay: postOpDay(row.surgerydate),
      status: row.status,
      recoveryScore: Number(row.recoveryscore),
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
    const planId = await activePlanId(id);
    if (!planId) return { items: [] };
    const rows = await q<{
      type: string;
      title: string;
      description: string;
      dosage: string | null;
      frequency: string | null;
      scheduletimes: string | null;
    }>(
      `SELECT type, title, description, dosage, frequency, "scheduleTimes" AS scheduletimes
       FROM care_plan_items WHERE "carePlanId"=$1 AND active=true`,
      [planId],
    );
    return {
      items: rows.map((i) => ({
        type: i.type,
        title: i.title,
        description: i.description,
        dosage: i.dosage,
        frequency: i.frequency,
        scheduleTimes: parseArray(i.scheduletimes),
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
    const planId = await activePlanId(id);
    if (!planId) return { medications: [] };
    const rows = await q<{
      title: string;
      dosage: string | null;
      frequency: string | null;
      scheduletimes: string | null;
      description: string;
    }>(
      `SELECT title, dosage, frequency, "scheduleTimes" AS scheduletimes, description
       FROM care_plan_items WHERE "carePlanId"=$1 AND type='MEDICATION' AND active=true`,
      [planId],
    );
    return {
      medications: rows.map((i) => ({
        title: i.title,
        dosage: i.dosage,
        frequency: i.frequency,
        scheduleTimes: parseArray(i.scheduletimes),
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
    const rows = await q<{
      date: string;
      painlevel: number;
      temperature: number | null;
      symptoms: string | null;
      risklevel: string | null;
    }>(
      `SELECT to_char(date,'YYYY-MM-DD') AS date, "painLevel" AS painlevel,
              temperature, symptoms, "riskLevel" AS risklevel
       FROM check_ins WHERE "patientId"=$1 ORDER BY "createdAt" DESC LIMIT $2`,
      [id, inputData?.limit ?? 5],
    );
    return {
      checkIns: rows.map((c) => ({
        date: c.date,
        painLevel: Number(c.painlevel),
        temperature: c.temperature != null ? Number(c.temperature) : null,
        symptoms: parseArray(c.symptoms),
        riskLevel: c.risklevel,
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

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { q, one, parseArray, uuid } from '../db';

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

export const escalateToDoctorTool = createTool({
  id: 'escalateToDoctor',
  description:
    "Notify the patient's REAL doctor and hospital when the patient reports red-flag symptoms (fever >= 38C, chills/shivering, severe or worsening pain, wound pus/redness/swelling/bleeding, persistent vomiting, breathing or chest problems, calf pain/swelling). This creates an alert in the doctor and hospital dashboards so a human can act. Call this BEFORE telling the patient their care team has been notified. Do NOT call it for mild or normal recovery questions.",
  inputSchema: z.object({
    patientId: z.string().optional(),
    reason: z
      .string()
      .describe(
        "Short summary of the red-flag symptoms in the patient's own language, e.g. '38.5C isitma, yara qizarishi, titroq'.",
      ),
    severity: z
      .enum(['HIGH', 'MEDIUM'])
      .optional()
      .describe(
        'HIGH = urgent/emergency signs; MEDIUM = concerning, needs review soon. Default HIGH.',
      ),
  }),
  outputSchema: z.object({
    created: z.boolean(),
    alreadyNotified: z.boolean(),
    severity: z.string(),
  }),
  execute: async (inputData, context) => {
    const id = resolvePatientId(inputData, context);
    const reason = String(inputData?.reason ?? '').slice(0, 500);
    const severityIn = inputData?.severity === 'MEDIUM' ? 'MEDIUM' : 'HIGH';

    const patient = await one<{ doctorId: string; hospitalId: string }>(
      `SELECT "doctorId","hospitalId" FROM patients WHERE id=$1`,
      [id],
    );
    if (!patient) throw new Error('Patient not found');

    // Dedup: at most one open AI escalation per patient per 2 hours, so a long
    // conversation about the same symptoms doesn't flood the doctor's inbox.
    const recent = await one<{ id: string }>(
      `SELECT id FROM alerts
       WHERE "patientId"=$1 AND type='AI_ESCALATION' AND status='UNREAD'
         AND "createdAt" > now() - interval '2 hours'
       LIMIT 1`,
      [id],
    );
    if (recent)
      return { created: false, alreadyNotified: true, severity: severityIn };

    const severity = severityIn === 'HIGH' ? 'CRITICAL' : 'WARNING';
    const title =
      severityIn === 'HIGH'
        ? 'Shoshilinch: AI suhbatda xavfli belgilar'
        : 'Diqqat: AI suhbatda belgilarni kuzatish';
    const message = `Bemor AI hamshira bilan suhbatda xavfli belgilarni bildirdi: ${reason}. Iltimos, bemor bilan tezroq bog'laning.`;
    const actionLabel = severityIn === 'HIGH' ? 'Shoshilinch javob' : "Ko'rish";

    await q(
      `INSERT INTO alerts
         (id,"patientId","doctorId","hospitalId",type,severity,title,message,"actionLabel",status)
       VALUES ($1,$2,$3,$4,'AI_ESCALATION',$5,$6,$7,$8,'UNREAD')`,
      [
        uuid(),
        id,
        patient.doctorId,
        patient.hospitalId,
        severity,
        title,
        message,
        actionLabel,
      ],
    );

    // Urgent chat escalation flags the patient as at-risk on the dashboards.
    if (severityIn === 'HIGH') {
      await q(
        `UPDATE patients SET status='AT_RISK', "updatedAt"=now() WHERE id=$1`,
        [id],
      );
    }

    return { created: true, alreadyNotified: false, severity: severityIn };
  },
});

export const patientTools = {
  getPatientProfileTool,
  getCarePlanTool,
  getMedicationScheduleTool,
  getRecentCheckInsTool,
  escalateToDoctorTool,
};

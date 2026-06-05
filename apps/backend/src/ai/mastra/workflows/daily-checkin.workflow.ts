import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { assessRisk } from '../../risk/risk.service';
import { q, one, uuid } from '../db';

/**
 * Daily check-in pipeline: AI risk triage -> persist assessment -> update the
 * check-in, recompute the recovery score, set patient status, and raise a
 * doctor alert when warranted. Durable + inspectable in Mastra Studio.
 */

const inputSchema = z.object({
  checkInId: z.string(),
  patientId: z.string(),
  painLevel: z.number(),
  temperature: z.number().nullable().optional(),
  symptoms: z.array(z.string()).optional(),
  mood: z.string().nullable().optional(),
  recoveryDay: z.number().optional(),
});

const riskSchema = z.object({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  advice: z.string(),
  alertDoctor: z.boolean(),
  confidence: z.number(),
  modelUsed: z.string(),
  fallbackUsed: z.boolean(),
});

const assessStep = createStep({
  id: 'assess-risk',
  inputSchema,
  outputSchema: inputSchema.extend({ risk: riskSchema }),
  execute: async ({ inputData }) => {
    const risk = await assessRisk({
      painLevel: inputData.painLevel,
      temperature: inputData.temperature,
      symptoms: inputData.symptoms,
      mood: inputData.mood,
      recoveryDay: inputData.recoveryDay,
    });
    return { ...inputData, risk };
  },
});

function computeScore(
  pain: number,
  temp: number | null | undefined,
  level: 'LOW' | 'MEDIUM' | 'HIGH',
): number {
  let s = 100 - pain * 6;
  if (temp != null && temp >= 38) s -= 25;
  else if (temp != null && temp >= 37.5) s -= 10;
  if (level === 'HIGH') s -= 20;
  else if (level === 'MEDIUM') s -= 8;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const persistStep = createStep({
  id: 'persist-and-alert',
  inputSchema: inputSchema.extend({ risk: riskSchema }),
  outputSchema: z.object({
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    advice: z.string(),
    confidence: z.number(),
    recoveryScore: z.number(),
    alertCreated: z.boolean(),
    modelUsed: z.string(),
    fallbackUsed: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { risk } = inputData;

    const patient = await one<{
      doctorId: string;
      hospitalId: string;
      status: string;
    }>(
      `SELECT "doctorId", "hospitalId", status FROM patients WHERE id=$1`,
      [inputData.patientId],
    );
    if (!patient) throw new Error('Patient not found');

    await q(
      `INSERT INTO risk_assessments
         (id,"checkInId","patientId","riskLevel",advice,"alertDoctor",confidence,"modelUsed","fallbackUsed")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuid(),
        inputData.checkInId,
        inputData.patientId,
        risk.riskLevel,
        risk.advice,
        risk.alertDoctor,
        risk.confidence,
        risk.modelUsed,
        risk.fallbackUsed,
      ],
    );

    await q(`UPDATE check_ins SET "riskLevel"=$1 WHERE id=$2`, [
      risk.riskLevel,
      inputData.checkInId,
    ]);

    const recoveryScore = computeScore(
      inputData.painLevel,
      inputData.temperature ?? null,
      risk.riskLevel,
    );
    const newStatus =
      risk.riskLevel === 'HIGH'
        ? 'AT_RISK'
        : patient.status !== 'RECOVERED'
          ? 'RECOVERING'
          : 'RECOVERED';
    await q(
      `UPDATE patients SET "recoveryScore"=$1, status=$2, "updatedAt"=now() WHERE id=$3`,
      [recoveryScore, newStatus, inputData.patientId],
    );

    const date = new Date().toISOString().slice(0, 10);
    await q(
      `INSERT INTO recovery_points (id,"patientId","hospitalId",date,score)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("patientId",date) DO UPDATE SET score=EXCLUDED.score`,
      [uuid(), inputData.patientId, patient.hospitalId, date, recoveryScore],
    );

    let alertCreated = false;
    if (risk.riskLevel === 'HIGH' || risk.riskLevel === 'MEDIUM') {
      const temp = inputData.temperature;
      const isFever = temp != null && temp >= 38;
      const severity = risk.riskLevel === 'HIGH' ? 'CRITICAL' : 'WARNING';
      const title = isFever
        ? 'Yuqori harorat haqida ogohlantirish'
        : risk.riskLevel === 'HIGH'
          ? 'Yuqori xavfli check-in'
          : 'Belgilarni kuzatish';
      await q(
        `INSERT INTO alerts
           (id,"patientId","doctorId","hospitalId",type,severity,title,message,"actionLabel",status)
         VALUES ($1,$2,$3,$4,'RISK',$5,$6,$7,$8,'UNREAD')`,
        [
          uuid(),
          inputData.patientId,
          patient.doctorId,
          patient.hospitalId,
          severity,
          title,
          isFever
            ? `Bemor harorati ${temp}°C deb bildirdi — infeksiya xavfi bo'lishi mumkin. ${risk.advice}`
            : risk.advice,
          risk.riskLevel === 'HIGH' ? 'Shoshilinch javob' : "Ko'rish",
        ],
      );
      alertCreated = true;
    }

    return {
      riskLevel: risk.riskLevel,
      advice: risk.advice,
      confidence: risk.confidence,
      recoveryScore,
      alertCreated,
      modelUsed: risk.modelUsed,
      fallbackUsed: risk.fallbackUsed,
    };
  },
});

export const dailyCheckInWorkflow = createWorkflow({
  id: 'dailyCheckInWorkflow',
  inputSchema,
  outputSchema: persistStep.outputSchema,
})
  .then(assessStep)
  .then(persistStep)
  .commit();

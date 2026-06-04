import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { assessRisk } from '../../risk/risk.service';
import { getAiDataSource } from '../db';
import { Patient } from '../../../entities/patient.entity';
import { CheckIn } from '../../../entities/check-in.entity';
import { RiskAssessment } from '../../../entities/risk-assessment.entity';
import { Alert } from '../../../entities/alert.entity';
import { RecoveryPoint } from '../../../entities/recovery-point.entity';

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
    const ds = await getAiDataSource();
    const patients = ds.getRepository(Patient);
    const checkIns = ds.getRepository(CheckIn);
    const risks = ds.getRepository(RiskAssessment);
    const alerts = ds.getRepository(Alert);
    const points = ds.getRepository(RecoveryPoint);

    const patient = await patients.findOne({
      where: { id: inputData.patientId },
    });
    if (!patient) throw new Error('Patient not found');

    await risks.save(
      risks.create({
        checkInId: inputData.checkInId,
        patientId: inputData.patientId,
        riskLevel: risk.riskLevel,
        advice: risk.advice,
        alertDoctor: risk.alertDoctor,
        confidence: risk.confidence,
        modelUsed: risk.modelUsed,
        fallbackUsed: risk.fallbackUsed,
      }),
    );

    await checkIns.update(
      { id: inputData.checkInId },
      { riskLevel: risk.riskLevel },
    );

    const recoveryScore = computeScore(
      inputData.painLevel,
      inputData.temperature ?? null,
      risk.riskLevel,
    );
    patient.recoveryScore = recoveryScore;
    if (risk.riskLevel === 'HIGH') patient.status = 'AT_RISK';
    else if (patient.status !== 'RECOVERED') patient.status = 'RECOVERING';
    await patients.save(patient);

    const date = new Date().toISOString().slice(0, 10);
    const existing = await points.findOne({
      where: { patientId: patient.id, date },
    });
    if (existing) {
      existing.score = recoveryScore;
      await points.save(existing);
    } else {
      await points.save(
        points.create({
          patientId: patient.id,
          hospitalId: patient.hospitalId,
          date,
          score: recoveryScore,
        }),
      );
    }

    let alertCreated = false;
    if (risk.riskLevel === 'HIGH' || risk.riskLevel === 'MEDIUM') {
      const temp = inputData.temperature;
      const isFever = temp != null && temp >= 38;
      const severity = risk.riskLevel === 'HIGH' ? 'CRITICAL' : 'WARNING';
      const title = isFever
        ? 'Elevated Temperature Alert'
        : risk.riskLevel === 'HIGH'
          ? 'High-Risk Check-in'
          : 'Symptom Watch';
      await alerts.save(
        alerts.create({
          patientId: patient.id,
          doctorId: patient.doctorId,
          hospitalId: patient.hospitalId,
          type: 'RISK',
          severity,
          title,
          message: isFever
            ? `Reported temperature ${temp}°C — possible infection risk. ${risk.advice}`
            : risk.advice,
          actionLabel: risk.riskLevel === 'HIGH' ? 'Emergency Response' : 'View',
          status: 'UNREAD',
        }),
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

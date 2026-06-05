import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { generateCarePlan } from '../../care-plan/care-plan.service';
import { carePlanItemSchema } from '../../care-plan/care-plan.types';
import { q, uuid } from '../db';

/**
 * Patient onboarding: when a doctor registers a patient we generate an
 * AI care plan (RAG-grounded, confidence-scored) and persist it as a DRAFT.
 * The doctor approves it (DRAFT -> ACTIVE) via the approve endpoint — the
 * human-in-the-loop gate. Runnable/inspectable in Mastra Studio.
 */

const inputSchema = z.object({
  patientId: z.string(),
  surgeryTypeId: z.string(),
  surgeryType: z.string(),
  surgeryDate: z.string(),
  language: z.enum(['en', 'ru', 'uz']).optional(),
});

const planSchema = z.object({
  confidence: z.number(),
  reasoning: z.string(),
  items: z.array(carePlanItemSchema),
  modelUsed: z.string(),
  fallbackUsed: z.boolean(),
});

const generateStep = createStep({
  id: 'generate-care-plan',
  inputSchema,
  outputSchema: inputSchema.extend({ plan: planSchema }),
  execute: async ({ inputData }) => {
    const plan = await generateCarePlan({
      surgeryType: inputData.surgeryType,
      surgeryDate: inputData.surgeryDate,
      language: inputData.language,
    });
    return { ...inputData, plan };
  },
});

const persistStep = createStep({
  id: 'persist-draft',
  inputSchema: inputSchema.extend({ plan: planSchema }),
  outputSchema: z.object({
    carePlanId: z.string(),
    itemCount: z.number(),
    confidence: z.number(),
    modelUsed: z.string(),
    fallbackUsed: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { plan } = inputData;
    const carePlanId = uuid();

    await q(
      `INSERT INTO care_plans
         (id,"patientId","surgeryTypeId",source,confidence,"aiReasoning","modelUsed",status)
       VALUES ($1,$2,$3,'AI',$4,$5,$6,'DRAFT')`,
      [
        carePlanId,
        inputData.patientId,
        inputData.surgeryTypeId,
        plan.confidence,
        plan.reasoning,
        plan.modelUsed,
      ],
    );

    for (const i of plan.items) {
      await q(
        `INSERT INTO care_plan_items
           (id,"carePlanId","patientId",type,title,description,"scheduleTimes",dosage,frequency,"startDay","durationDays",active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
        [
          uuid(),
          carePlanId,
          inputData.patientId,
          i.type,
          i.title,
          i.description,
          i.scheduleTimes?.join(',') ?? null,
          i.dosage ?? null,
          i.frequency ?? null,
          i.startDay,
          i.durationDays ?? null,
        ],
      );
    }

    return {
      carePlanId,
      itemCount: plan.items.length,
      confidence: plan.confidence,
      modelUsed: plan.modelUsed,
      fallbackUsed: plan.fallbackUsed,
    };
  },
});

export const patientOnboardingWorkflow = createWorkflow({
  id: 'patientOnboardingWorkflow',
  inputSchema,
  outputSchema: z.object({
    carePlanId: z.string(),
    itemCount: z.number(),
    confidence: z.number(),
    modelUsed: z.string(),
    fallbackUsed: z.boolean(),
  }),
})
  .then(generateStep)
  .then(persistStep)
  .commit();

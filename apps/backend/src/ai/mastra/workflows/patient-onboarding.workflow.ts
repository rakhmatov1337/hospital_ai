import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { generateCarePlan } from '../../care-plan/care-plan.service';
import { carePlanItemSchema } from '../../care-plan/care-plan.types';
import { getAiDataSource } from '../db';
import { CarePlan } from '../../../entities/care-plan.entity';
import { CarePlanItem } from '../../../entities/care-plan-item.entity';

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
    const ds = await getAiDataSource();
    const planRepo = ds.getRepository(CarePlan);
    const itemRepo = ds.getRepository(CarePlanItem);

    const carePlan = await planRepo.save(
      planRepo.create({
        patientId: inputData.patientId,
        surgeryTypeId: inputData.surgeryTypeId,
        source: 'AI',
        confidence: plan.confidence,
        aiReasoning: plan.reasoning,
        modelUsed: plan.modelUsed,
        status: 'DRAFT',
      }),
    );

    await itemRepo.save(
      plan.items.map((i) =>
        itemRepo.create({
          carePlanId: carePlan.id,
          patientId: inputData.patientId,
          type: i.type,
          title: i.title,
          description: i.description,
          scheduleTimes: i.scheduleTimes,
          dosage: i.dosage ?? null,
          frequency: i.frequency ?? null,
          startDay: i.startDay,
          durationDays: i.durationDays ?? null,
        }),
      ),
    );

    return {
      carePlanId: carePlan.id,
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

import { z } from 'zod';

export const carePlanItemSchema = z.object({
  type: z.enum(['MEDICATION', 'EXERCISE', 'DIET', 'RESTRICTION']),
  title: z.string().describe('Short title, e.g. "Ibuprofen 400mg"'),
  description: z
    .string()
    .describe('Patient-friendly instruction, one or two sentences.'),
  scheduleTimes: z
    .array(z.string())
    .optional()
    .describe('Daily clock times like ["08:00","20:00"] for recurring items.'),
  dosage: z.string().optional().describe('Medication dose, e.g. "400mg".'),
  frequency: z
    .string()
    .optional()
    .describe('e.g. "twice daily", "every hour while awake".'),
  startDay: z
    .number()
    .int()
    .min(0)
    .describe('First post-op day this item applies (0 = day of surgery).'),
  durationDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('How many days it runs; omit for ongoing items.'),
});

export const carePlanResultSchema = z.object({
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Your confidence (0-1) that this plan is safe and appropriate.'),
  reasoning: z
    .string()
    .describe('Brief clinical rationale, citing the knowledge base.'),
  items: z
    .array(carePlanItemSchema)
    .min(4)
    .describe('Medications, exercises, diet, and restrictions.'),
});

export type CarePlanItemInput = z.infer<typeof carePlanItemSchema>;
export type CarePlanResult = z.infer<typeof carePlanResultSchema>;

export interface CarePlanGenInput {
  surgeryType: string;
  surgeryDate: string;
  language?: 'en' | 'ru' | 'uz';
}

export interface CarePlanGenOutput extends CarePlanResult {
  modelUsed: string;
  fallbackUsed: boolean;
}

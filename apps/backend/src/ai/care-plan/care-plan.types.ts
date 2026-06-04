import { z } from 'zod';

export const carePlanItemSchema = z.object({
  type: z.enum(['MEDICATION', 'DIET', 'ACTIVITY', 'CHECKUP', 'RESTRICTION']),
  title: z.string(),
  description: z.string(),
  dayOffset: z.number().int().min(0),
  scheduleTime: z.string().nullable().optional(),
});

export const carePlanSchema = z.object({
  items: z.array(carePlanItemSchema),
});

export type CarePlanItem = z.infer<typeof carePlanItemSchema>;
export type CarePlan = z.infer<typeof carePlanSchema>;

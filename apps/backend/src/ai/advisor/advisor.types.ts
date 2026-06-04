import { z } from 'zod';

export const advisorResultSchema = z.object({
  smartAlerts: z
    .array(
      z.object({
        patientName: z.string(),
        message: z.string().describe('Urgent clinical observation or action.'),
      }),
    )
    .describe('Patients needing attention now.'),
  optimizations: z
    .array(
      z.object({
        patientName: z.string(),
        message: z
          .string()
          .describe('Opportunity to optimize care (e.g. adjust dose).'),
      }),
    )
    .describe('Lower-urgency recovery optimizations.'),
});

export type AdvisorResult = z.infer<typeof advisorResultSchema>;

export interface AdvisorOutput extends AdvisorResult {
  modelUsed: string;
  fallbackUsed: boolean;
}

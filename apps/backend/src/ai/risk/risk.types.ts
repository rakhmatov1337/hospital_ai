import { z } from 'zod';

export const riskResultSchema = z.object({
  riskLevel: z
    .enum(['LOW', 'MEDIUM', 'HIGH'])
    .describe('Overall post-operative risk from this check-in.'),
  advice: z
    .string()
    .describe('Short, patient-friendly advice and any action to take.'),
  alertDoctor: z
    .boolean()
    .describe('True if the doctor should be alerted (red flags present).'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Your confidence (0-1) in this assessment.'),
});

export type RiskResult = z.infer<typeof riskResultSchema>;

export interface RiskInput {
  painLevel: number;
  temperature?: number | null;
  symptoms?: string[];
  mood?: string | null;
  recoveryDay?: number;
}

export interface RiskOutput extends RiskResult {
  modelUsed: string;
  fallbackUsed: boolean;
}

import { z } from 'zod';

export const riskResultSchema = z.object({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  advice: z.string(),
  alertDoctor: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type RiskResult = z.infer<typeof riskResultSchema>;

export interface CheckIn {
  painLevel: number;
  temperature?: number;
  symptoms?: string[];
  mood?: string;
  recoveryDay?: number;
  notes?: string;
}

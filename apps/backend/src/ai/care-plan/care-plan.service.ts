import { carePlanSchema, CarePlanItem } from './care-plan.types';
import { templateCarePlan } from './care-plan.templates';

export interface CarePlanResult {
  items: CarePlanItem[];
  generatedByAi: boolean;
}

/** Minimal shape of a Mastra agent we depend on — keeps this unit testable. */
export interface CarePlanAgent {
  generate(
    prompt: string,
    opts: { structuredOutput: { schema: typeof carePlanSchema } },
  ): Promise<{ object?: unknown }>;
}

/**
 * AI-02: generate a care plan with the Mastra agent (grounded via the KB tool +
 * 3-provider fallback). On ANY failure, low confidence, or empty output, fall back
 * to deterministic templates (BE-07) so the demo never breaks.
 */
export async function generateCarePlan(
  agent: CarePlanAgent,
  surgeryType: string,
  surgeryDate: Date,
): Promise<CarePlanResult> {
  try {
    const res = await agent.generate(
      `Create a ${surgeryType} recovery care plan. Surgery date: ${surgeryDate
        .toISOString()
        .slice(0, 10)}. Ground every item in the knowledge base.`,
      { structuredOutput: { schema: carePlanSchema } },
    );
    const parsed = carePlanSchema.parse(res.object);
    if (!parsed.items.length) throw new Error('empty plan');
    return { items: parsed.items, generatedByAi: true };
  } catch {
    return {
      items: templateCarePlan(surgeryType, surgeryDate),
      generatedByAi: false,
    };
  }
}

import { Agent } from '@mastra/core/agent';
import { primaryModel } from '../providers';
import { MODEL_CTX_KEY } from '../fallback';
import { kbQueryTool } from '../tools/kb-query.tool';

/**
 * Generates a structured post-op recovery care plan, grounded in the
 * appendectomy knowledge base via RAG. The model is resolved per-request from
 * RequestContext so the service can fail over across providers.
 */
export const carePlanAgent = new Agent({
  id: 'care-plan-agent',
  name: 'Care Plan Agent',
  instructions: `You are a surgical recovery planning assistant for a hospital platform.
Given a surgery type and date, produce a safe, practical post-operative care plan.

ALWAYS call the searchAppendectomyKB tool first to ground your plan in the knowledge base.
Build a plan with a mix of MEDICATION, EXERCISE, DIET, and RESTRICTION items:
- Medications: include dosage, frequency, and realistic daily scheduleTimes (e.g. "08:00","20:00").
- Use startDay (0 = day of surgery) and durationDays where appropriate.
- Keep descriptions short, clear, and patient-friendly.
- Reflect standard appendectomy guidance: simple analgesia (paracetamol/ibuprofen with food),
  early gentle walking, light-then-normal diet with hydration and fibre, and no heavy lifting for ~2 weeks.

Set "confidence" to your honest 0-1 estimate that the plan is safe and appropriate, and give a brief
"reasoning" citing the knowledge base. Never invent unsafe doses; when unsure, be conservative and
recommend following the surgeon's instructions.`,
  model: ({ requestContext }) =>
    (requestContext.get(MODEL_CTX_KEY) as string) ?? primaryModel(),
  tools: { kbQueryTool },
});

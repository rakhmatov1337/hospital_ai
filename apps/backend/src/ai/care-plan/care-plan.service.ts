import { Agent } from '@mastra/core/agent';
import { stepCountIs } from 'ai';
import { carePlanAgent } from '../mastra/agents/care-plan.agent';
import { withModelFallback } from '../mastra/fallback';
import {
  carePlanResultSchema,
  CarePlanGenInput,
  CarePlanGenOutput,
} from './care-plan.types';
import { appendectomyTemplate } from './care-plan.templates';

/**
 * Generate a structured, RAG-grounded care plan with two-layer safety:
 *   1. AI: carePlanAgent across the provider fallback chain (confidence-scored).
 *   2. Non-AI: appendectomy template if every provider fails.
 * The agent is injectable so this stays unit-testable without hitting an LLM.
 */
export async function generateCarePlan(
  input: CarePlanGenInput,
  agent: Agent = carePlanAgent,
): Promise<CarePlanGenOutput> {
  const prompt =
    `Surgery type: ${input.surgeryType}\n` +
    `Surgery date: ${input.surgeryDate}\n` +
    `Patient language: ${input.language ?? 'en'}\n` +
    `Generate the post-operative recovery care plan now.`;

  try {
    const { result, modelUsed } = await withModelFallback(({ requestContext }) =>
      agent.generate(prompt, {
        requestContext,
        structuredOutput: { schema: carePlanResultSchema },
        stopWhen: stepCountIs(4),
      }),
    );
    const object = result.object;
    if (!object || !object.items?.length) {
      throw new Error('Empty structured output');
    }
    return { ...object, modelUsed, fallbackUsed: false };
  } catch {
    const template = appendectomyTemplate();
    return { ...template, modelUsed: 'template-fallback', fallbackUsed: true };
  }
}

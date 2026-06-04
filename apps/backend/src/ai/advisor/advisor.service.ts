import { Agent } from '@mastra/core/agent';
import { stepCountIs } from 'ai';
import { clinicalAdvisorAgent } from '../mastra/agents/clinical-advisor.agent';
import { withModelFallback } from '../mastra/fallback';
import { advisorResultSchema, AdvisorOutput } from './advisor.types';

/**
 * Generate clinical-advisor insights from a cohort summary. Two-layer safety:
 * AI agent across the provider chain, else an empty (safe) result.
 */
export async function generateAdvisor(
  summary: string,
  agent: Agent = clinicalAdvisorAgent,
): Promise<AdvisorOutput> {
  try {
    const { result, modelUsed } = await withModelFallback(({ requestContext }) =>
      agent.generate(
        `Here is the current patient cohort:\n\n${summary}\n\nProduce the advisor insights now.`,
        {
          requestContext,
          structuredOutput: { schema: advisorResultSchema },
          stopWhen: stepCountIs(2),
        },
      ),
    );
    const object = result.object;
    if (!object) throw new Error('Empty structured output');
    return { ...object, modelUsed, fallbackUsed: false };
  } catch {
    return {
      smartAlerts: [],
      optimizations: [],
      modelUsed: 'fallback',
      fallbackUsed: true,
    };
  }
}

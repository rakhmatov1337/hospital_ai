import { Agent } from '@mastra/core/agent';
import { stepCountIs } from 'ai';
import { riskAgent } from '../mastra/agents/risk.agent';
import { withModelFallback } from '../mastra/fallback';
import { riskResultSchema, RiskInput, RiskOutput } from './risk.types';

const RED_FLAG_WORDS = [
  'bleeding',
  'pus',
  'discharge',
  'fever',
  'vomit',
  'chest',
  'breath',
  'swelling',
  'redness',
  'wound open',
];

/** Deterministic non-AI fallback used if every provider fails. */
export function ruleRisk(input: RiskInput): RiskOutput {
  const temp = input.temperature ?? 0;
  const symptoms = (input.symptoms ?? []).map((s) => s.toLowerCase());
  const hasRedFlag = symptoms.some((s) =>
    RED_FLAG_WORDS.some((w) => s.includes(w)),
  );
  let riskLevel: RiskOutput['riskLevel'] = 'LOW';
  if (temp >= 38 || input.painLevel >= 8 || hasRedFlag) riskLevel = 'HIGH';
  else if (temp >= 37.5 || input.painLevel >= 5) riskLevel = 'MEDIUM';
  const alertDoctor = riskLevel === 'HIGH';
  const advice =
    riskLevel === 'HIGH'
      ? 'Your symptoms may indicate a complication. We are notifying your care team — seek urgent care if you feel worse.'
      : riskLevel === 'MEDIUM'
        ? 'Keep monitoring your symptoms, rest, and stay hydrated. Contact your team if things worsen.'
        : 'You appear to be recovering well. Keep following your care plan.';
  return {
    riskLevel,
    advice,
    alertDoctor,
    confidence: 0.6,
    modelUsed: 'rule-fallback',
    fallbackUsed: true,
  };
}

/**
 * Assess check-in risk with two-layer safety: AI risk agent across the provider
 * fallback chain, then the deterministic rule engine if all providers fail.
 */
export async function assessRisk(
  input: RiskInput,
  agent: Agent = riskAgent,
): Promise<RiskOutput> {
  const prompt =
    `Recovery day: ${input.recoveryDay ?? 'unknown'}\n` +
    `Pain level (0-10): ${input.painLevel}\n` +
    `Temperature: ${input.temperature ?? 'not reported'}\n` +
    `Symptoms: ${input.symptoms?.join(', ') || 'none reported'}\n` +
    `Mood: ${input.mood ?? 'not reported'}\n` +
    `Assess the risk now.`;

  try {
    const { result, modelUsed } = await withModelFallback(({ requestContext }) =>
      agent.generate(prompt, {
        requestContext,
        structuredOutput: { schema: riskResultSchema },
        stopWhen: stepCountIs(4),
      }),
    );
    const object = result.object;
    if (!object) throw new Error('Empty structured output');
    return { ...object, modelUsed, fallbackUsed: false };
  } catch {
    return ruleRisk(input);
  }
}

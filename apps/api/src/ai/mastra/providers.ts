/**
 * Model-router providers for the clinician-side AI (SP6).
 *
 * Ported from the legacy backend's provider chain. Model strings use Mastra's
 * model-router format ('provider/model'). The chain is built only from keys that
 * are actually configured, so we never waste an attempt on an unset provider.
 *
 * NOTE: nothing here is ever reachable from a patient request path — this AI
 * only drafts a recovery plan for a clinician to approve (see the SP6 spec and
 * the AI-safety-line KB: "the AI selects, schedules, translates and routes
 * approved content — it never composes").
 */

const PROVIDER_PRIORITY: { env: string; model: string }[] = [
  { env: 'OPENAI_API_KEY', model: 'openai/gpt-5.4-mini' },
  { env: 'ANTHROPIC_API_KEY', model: 'anthropic/claude-sonnet-4-6' },
  { env: 'GOOGLE_GENERATIVE_AI_API_KEY', model: 'google/gemini-2.5-flash' },
];

/** True when at least one provider key is configured. */
export function hasConfiguredProvider(): boolean {
  return PROVIDER_PRIORITY.some((p) => Boolean(process.env[p.env]));
}

/** Model-router strings for every configured provider, in failover order. */
export function configuredModelChain(): string[] {
  return PROVIDER_PRIORITY.filter((p) => process.env[p.env]).map((p) => p.model);
}

/**
 * Primary (highest-priority configured) model. Resolved lazily at call time —
 * never at module load — so the API boots fine with no AI key configured.
 */
export function primaryModel(): string {
  const chain = configuredModelChain();
  if (chain.length === 0) {
    throw new Error(
      'No AI provider key configured — set OPENAI_API_KEY to use the care-plan selector.',
    );
  }
  return chain[0];
}

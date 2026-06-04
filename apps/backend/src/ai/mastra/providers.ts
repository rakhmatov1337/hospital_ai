import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

type ModelEntry = { model: string; maxRetries: number };

/**
 * Ordered provider preference. The fallback chain is built from the keys that
 * are actually configured, so we never waste an attempt on an unset provider.
 */
const PROVIDER_PRIORITY: { env: string; model: string }[] = [
  { env: 'OPENAI_API_KEY', model: 'openai/gpt-5.4-mini' },
  { env: 'ANTHROPIC_API_KEY', model: 'anthropic/claude-sonnet-4-6' },
  { env: 'GOOGLE_GENERATIVE_AI_API_KEY', model: 'google/gemini-2.5-flash' },
];

/** Model-router strings for every configured provider, in failover order. */
export function configuredModelChain(): string[] {
  const chain = PROVIDER_PRIORITY.filter((p) => process.env[p.env]).map(
    (p) => p.model,
  );
  if (chain.length === 0)
    throw new Error(
      'No AI provider key configured — set OPENAI_API_KEY at minimum.',
    );
  return chain;
}

/** Primary (highest-priority configured) model. */
export function primaryModel(): string {
  return configuredModelChain()[0];
}

/**
 * Build the provider fallback chain from the keys that are actually configured (AI-01).
 * Order = priority: OpenAI (primary) → Anthropic → Gemini. Missing keys are skipped so
 * we never waste retries on an unconfigured provider. App-level fallbacks (templates /
 * rules) still sit on top of this.
 */
export function resolveFallbackModels(): ModelEntry[] {
  const chain: ModelEntry[] = [];
  if (process.env.OPENAI_API_KEY)
    chain.push({ model: 'openai/gpt-5.4-mini', maxRetries: 2 });
  if (process.env.ANTHROPIC_API_KEY)
    chain.push({ model: 'anthropic/claude-sonnet-4-6', maxRetries: 1 });
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    chain.push({ model: 'google/gemini-2.5-flash', maxRetries: 1 });
  if (chain.length === 0)
    throw new Error(
      'No AI provider key configured — set OPENAI_API_KEY at minimum.',
    );
  return chain;
}

/** Embedding model for RAG + memory. text-embedding-3-small => 1536 dims. */
export const EMBEDDER = () =>
  new ModelRouterEmbeddingModel('openai/text-embedding-3-small');
export const EMBED_DIM = 1536;

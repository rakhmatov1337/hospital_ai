import { RequestContext } from '@mastra/core/request-context';
import { configuredModelChain } from './providers';

/** RequestContext key the agents read to pick their model at runtime. */
export const MODEL_CTX_KEY = 'model';

/**
 * Run an agent call across the configured provider chain (OpenAI → Anthropic →
 * Gemini), returning the first success plus the model that produced it. Each
 * attempt injects a RequestContext so the agent's dynamic `model` resolver
 * selects that provider. This is the AI-layer half of the two-layer safety net
 * (the other half is the non-AI template/rule fallback in each service).
 */
export async function withModelFallback<T>(
  run: (args: { requestContext: RequestContext; model: string }) => Promise<T>,
): Promise<{ result: T; modelUsed: string }> {
  const chain = configuredModelChain();
  let lastErr: unknown;
  for (const model of chain) {
    try {
      const requestContext = new RequestContext();
      requestContext.set(MODEL_CTX_KEY, model);
      const result = await run({ requestContext, model });
      return { result, modelUsed: model };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

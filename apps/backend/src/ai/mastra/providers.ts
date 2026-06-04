import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

/**
 * 3-provider fallback chain. Mastra tries the primary first; on 500 / rate-limit /
 * timeout it falls over to the next provider automatically (AI-01).
 * Verify the exact array shape against the Mastra MCP (`getMastraExportDetails` on
 * @mastra/core Agent) — v1 fallback config.
 */
export const FALLBACK_MODELS = [
  { model: 'openai/gpt-5.4-mini', maxRetries: 2 }, // primary: fast + cheap
  { model: 'anthropic/claude-sonnet-4-6', maxRetries: 1 }, // backup 1
  { model: 'google/gemini-2.5-flash', maxRetries: 1 }, // backup 2
];

/** Embedding model for RAG + memory. text-embedding-3-small => 1536 dims. */
export const EMBEDDER = () =>
  new ModelRouterEmbeddingModel('openai/text-embedding-3-small');
export const EMBED_DIM = 1536;

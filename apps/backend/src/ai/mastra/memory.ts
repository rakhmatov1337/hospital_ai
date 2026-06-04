import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { EMBEDDER } from './providers';

/**
 * AI-05: Mastra Memory for the nurse chat agent. Uses a local LibSQL file store so
 * memory works offline and the demo can't break if Neon hiccups (RAG stays on
 * pgvector/Neon). Working memory + semantic recall are scoped by `resource`
 * (the patient), so context persists across the patient's chat sessions.
 */
export const memory = new Memory({
  storage: new LibSQLStore({ id: 'mem-store', url: 'file:./hospital-memory.db' }),
  vector: new LibSQLVector({ id: 'mem-vector', url: 'file:./hospital-memory.db' }),
  embedder: EMBEDDER(),
  options: {
    lastMessages: 15,
    workingMemory: { enabled: true, scope: 'resource' },
    semanticRecall: {
      topK: 3,
      messageRange: { before: 2, after: 1 },
      scope: 'resource',
    },
  },
});

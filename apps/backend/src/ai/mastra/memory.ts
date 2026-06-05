import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { pgConnectionString } from './vectors';
import { EMBEDDER } from './providers';

/**
 * AI-05: Mastra Memory for the nurse chat agent. Stored in Postgres (same DB as
 * RAG/pgvector) so the api + studio processes can share it without SQLITE_BUSY
 * locks. Working memory + semantic recall are scoped by `resource` (the
 * patient), so context persists across the patient's chat sessions.
 */
export const memory = new Memory({
  storage: new PostgresStore({
    id: 'mem-store',
    connectionString: pgConnectionString(),
  }),
  vector: new PgVector({ id: 'mem-vector', connectionString: pgConnectionString() }),
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

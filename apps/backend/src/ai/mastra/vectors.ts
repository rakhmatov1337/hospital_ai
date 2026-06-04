import { PgVector } from '@mastra/pg';
import { env } from '../../config/env';

/**
 * pgvector store shared by RAG ingestion and the KB query tool. Each surgery
 * type gets its own index; only Appendectomy is wired to a real KB for the
 * hackathon. The registry name (`pgVector` in the Mastra instance) must match
 * the `vectorStoreName` used by `createVectorQueryTool`.
 */
export const KB_INDEX = 'appendectomy_kb';

/** Resolve the pgvector index name for a surgery type (defaults to appendectomy). */
export function kbIndexFor(name?: string | null): string {
  return name && name.trim() ? name : KB_INDEX;
}

/** Disable SSL for local Postgres, require it for cloud — deterministic either way. */
function pgConnectionString(): string {
  const u = new URL(env.databaseUrl());
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  if (isLocal) u.searchParams.set('sslmode', 'disable');
  else if (!u.searchParams.get('sslmode'))
    u.searchParams.set('sslmode', 'require');
  return u.toString();
}

export const pgVector = new PgVector({
  id: 'kb-vector',
  connectionString: pgConnectionString(),
});

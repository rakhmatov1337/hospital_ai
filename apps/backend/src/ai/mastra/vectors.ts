import { PgVector } from '@mastra/pg';
import { env } from '../../config/env';

/** Registry name must match `vectorStoreName` in the query tool and `vectors: { pgVector }` in the Mastra instance. */
export const KB_INDEX = 'cesarean_kb';

/** Disable SSL for local Postgres, require it for cloud (e.g. Neon) — deterministic either way. */
function pgConnectionString(): string {
  const u = new URL(env.databaseUrl());
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  if (isLocal) u.searchParams.set('sslmode', 'disable');
  else if (!u.searchParams.get('sslmode')) u.searchParams.set('sslmode', 'require');
  return u.toString();
}

export const pgVector = new PgVector({
  id: 'kb-vector',
  connectionString: pgConnectionString(),
});

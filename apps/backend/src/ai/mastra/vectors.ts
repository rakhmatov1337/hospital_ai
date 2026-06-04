import { PgVector } from '@mastra/pg';
import { env } from '../../config/env';

/** Registry name must match `vectorStoreName` in the query tool and `vectors: { pgVector }` in the Mastra instance. */
export const KB_INDEX = 'cesarean_kb';

export const pgVector = new PgVector({
  id: 'kb-vector',
  connectionString: env.databaseUrl(),
});

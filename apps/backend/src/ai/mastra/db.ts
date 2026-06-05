import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';

/**
 * Raw pg access for Mastra tools/workflows. Deliberately TypeORM-free: the
 * Mastra bundler (Studio / `mastra build`) uses esbuild, which does NOT emit
 * decorator metadata, so importing TypeORM entity classes here would crash the
 * bundle. Column identifiers are camelCase (created by TypeORM) so they must be
 * double-quoted in SQL.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const url = env.databaseUrl();
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(
    new URL(url).hostname,
  );
  pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  return pool;
}

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export const uuid = () => randomUUID();

/** simple-array columns are stored comma-joined; parse back to string[]. */
export function parseArray(v: unknown): string[] | undefined {
  if (v == null || v === '') return undefined;
  return String(v).split(',');
}

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestText } from '../mastra/ingestion';
import { KB_INDEX } from '../mastra/vectors';

/**
 * Seed the appendectomy RAG knowledge base into pgvector.
 * Run once after the DB is up:  npm run ingest
 * Requires OPENAI_API_KEY (embeddings) and the pgvector extension:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 */
async function main() {
  const file = join(
    __dirname,
    '..',
    'knowledge',
    'appendectomy',
    'appendectomy-recovery.md',
  );
  const text = readFileSync(file, 'utf8');
  console.log(`Ingesting appendectomy KB into index "${KB_INDEX}"...`);
  const { chunkCount } = await ingestText({
    text,
    indexName: KB_INDEX,
    title: 'Appendectomy Recovery — Patient Guide',
    source: 'MedlinePlus / NHS / StatPearls (open-licensed, paraphrased)',
  });
  console.log(`Done. ${chunkCount} chunks embedded into "${KB_INDEX}".`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Ingestion failed:', e);
  process.exit(1);
});

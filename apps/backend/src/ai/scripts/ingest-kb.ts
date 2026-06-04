import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { embedMany } from 'ai';
import { MDocument } from '@mastra/rag';
import { EMBEDDER, EMBED_DIM } from '../mastra/providers';
import { pgVector, KB_INDEX } from '../mastra/vectors';

const KB_DIR = join(__dirname, '../knowledge/cesarean');

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2] };
}

async function main(): Promise<void> {
  const files = readdirSync(KB_DIR).filter(
    (f) => f.endsWith('.md') && !f.startsWith('00-'),
  );

  const records: { text: string; metadata: Record<string, unknown> }[] = [];
  for (const file of files) {
    const { meta, body } = parseFrontmatter(
      readFileSync(join(KB_DIR, file), 'utf8'),
    );
    const doc = MDocument.fromMarkdown(body);
    const chunks = await doc.chunk({
      strategy: 'markdown',
      maxSize: 800,
      overlap: 100,
    });
    for (const c of chunks) {
      records.push({
        text: c.text,
        metadata: {
          ...meta,
          surgeryType: meta.surgeryType ?? 'cesarean',
          file,
        },
      });
    }
  }

  const { embeddings } = await embedMany({
    model: EMBEDDER(),
    values: records.map((r) => r.text),
  });

  await pgVector.createIndex({ indexName: KB_INDEX, dimension: EMBED_DIM });
  await pgVector.upsert({
    indexName: KB_INDEX,
    vectors: embeddings,
    // store the chunk text in metadata so retrieval returns it as relevantContext
    metadata: records.map((r) => ({ text: r.text, ...r.metadata })),
  });

  console.log(
    `Ingested ${records.length} chunks from ${files.length} files into "${KB_INDEX}".`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

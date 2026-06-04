import pdfParse from 'pdf-parse';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { EMBEDDER, EMBED_DIM } from './providers';
import { pgVector } from './vectors';

/** Extract plain text from an uploaded document (PDF or markdown/text). */
export async function extractText(
  buffer: Buffer,
  fileName?: string,
  mime?: string,
): Promise<string> {
  const isPdf =
    mime?.includes('pdf') || fileName?.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  return buffer.toString('utf8');
}

/** Chunk markdown content into structure-aware pieces ready for embedding. */
export async function chunkMarkdown(text: string): Promise<string[]> {
  const doc = MDocument.fromMarkdown(text);
  const chunks = await doc.chunk({
    strategy: 'markdown',
    maxSize: 700,
    overlap: 80,
  });
  return chunks.map((c) => c.text).filter((t) => t.trim().length > 0);
}

/** Embed chunk texts and upsert them into a pgvector index (creates it if needed). */
export async function embedAndUpsert(
  indexName: string,
  texts: string[],
  meta: { title: string; source?: string },
): Promise<number> {
  if (!texts.length) return 0;
  const { embeddings } = await embedMany({
    model: EMBEDDER(),
    values: texts,
  });
  await pgVector.createIndex({ indexName, dimension: EMBED_DIM });
  await pgVector.upsert({
    indexName,
    vectors: embeddings,
    metadata: texts.map((text) => ({
      text,
      title: meta.title,
      source: meta.source ?? meta.title,
    })),
  });
  return texts.length;
}

/** One-shot: chunk + embed + upsert markdown text. Returns chunk count. */
export async function ingestText(opts: {
  text: string;
  indexName: string;
  title: string;
  source?: string;
}): Promise<{ chunkCount: number }> {
  const texts = await chunkMarkdown(opts.text);
  const chunkCount = await embedAndUpsert(opts.indexName, texts, {
    title: opts.title,
    source: opts.source,
  });
  return { chunkCount };
}

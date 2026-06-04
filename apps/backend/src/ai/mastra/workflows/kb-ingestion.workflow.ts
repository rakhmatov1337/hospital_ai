import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { chunkMarkdown, embedAndUpsert } from '../ingestion';

/**
 * KB ingestion workflow (superadmin AI-document upload). The Nest endpoint
 * extracts text from the uploaded PDF/markdown, then runs this workflow:
 * chunk -> embed + upsert into the surgery's pgvector index. Visible and
 * runnable in Mastra Studio.
 */

const inputSchema = z.object({
  text: z.string(),
  indexName: z.string(),
  title: z.string(),
  source: z.string().optional(),
});

const chunkStep = createStep({
  id: 'chunk',
  inputSchema,
  outputSchema: inputSchema.extend({ chunks: z.array(z.string()) }),
  execute: async ({ inputData }) => {
    const chunks = await chunkMarkdown(inputData.text);
    return { ...inputData, chunks };
  },
});

const embedStep = createStep({
  id: 'embed-upsert',
  inputSchema: inputSchema.extend({ chunks: z.array(z.string()) }),
  outputSchema: z.object({ chunkCount: z.number(), indexName: z.string() }),
  execute: async ({ inputData }) => {
    const chunkCount = await embedAndUpsert(
      inputData.indexName,
      inputData.chunks,
      { title: inputData.title, source: inputData.source },
    );
    return { chunkCount, indexName: inputData.indexName };
  },
});

export const kbIngestionWorkflow = createWorkflow({
  id: 'kbIngestionWorkflow',
  inputSchema,
  outputSchema: z.object({ chunkCount: z.number(), indexName: z.string() }),
})
  .then(chunkStep)
  .then(embedStep)
  .commit();

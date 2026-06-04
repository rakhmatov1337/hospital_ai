import { createVectorQueryTool } from '@mastra/rag';
import { EMBEDDER } from '../providers';
import { KB_INDEX } from '../vectors';

/**
 * RAG retrieval over the appendectomy knowledge base. `vectorStoreName` must
 * match the registry key in the Mastra instance (`vectors: { pgVector }`), and
 * `indexName` must match the ingested index.
 */
export const kbQueryTool = createVectorQueryTool({
  id: 'searchAppendectomyKB',
  description:
    'Search the appendectomy recovery knowledge base for grounded clinical guidance (wound care, pain/medication, diet, activity, warning signs). Always use this before giving recovery advice.',
  vectorStoreName: 'pgVector',
  indexName: KB_INDEX,
  model: EMBEDDER(),
  enableFilter: true,
  includeSources: true,
});

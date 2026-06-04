import { createVectorQueryTool } from '@mastra/rag';
import { EMBEDDER } from '../providers';
import { KB_INDEX } from '../vectors';

/**
 * RAG tool over the cesarean recovery KB (AI-08). Attached to the care-plan and
 * nurse-chat agents so answers are grounded in real guidelines (NHS + MedlinePlus).
 * `enableFilter` lets the agent filter by metadata (surgeryType / section).
 */
export const kbQueryTool = createVectorQueryTool({
  id: 'searchCesareanKB',
  description:
    'Search the cesarean (C-section) recovery guideline knowledge base. Use for any clinical recovery question: wound care, pain, activity limits, warning signs, emotional recovery.',
  vectorStoreName: 'pgVector',
  indexName: KB_INDEX,
  model: EMBEDDER(),
  enableFilter: true,
  includeSources: true,
});

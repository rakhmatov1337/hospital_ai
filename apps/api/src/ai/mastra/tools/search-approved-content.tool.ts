import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  fetchApprovedContentForAssistant,
  type CatalogLanguage,
} from '../../content-catalog';

/**
 * The CLOSED SET the patient-assistant may quote FROM (SP7).
 *
 * This is the assistant's only source of clinical text. It returns the
 * clinician-APPROVED content available to THIS patient — in their language,
 * for their procedure, unlocked for their recovery day. The agent is instructed
 * to answer ONLY from these chunks and to cite the `contentKey` of anything it
 * uses; the service's output guard independently blocks any reply that strays
 * into judgment (defence in depth — the model is never trusted).
 *
 * The query itself lives in ../../content-catalog (Mastra-free) so the retrieval
 * can be tested without loading the agent framework.
 */
export const searchApprovedContentTool = createTool({
  id: 'searchApprovedContent',
  description:
    "Retrieve the clinician-APPROVED content available to this patient. You may ONLY answer from the text this returns, and you must cite the contentKey of anything you use. If it returns nothing relevant, say you have no approved guidance and tell the patient to contact their clinic — never answer from your own knowledge.",
  inputSchema: z.object({
    query: z.string().describe("The patient's question, for your own relevance filtering."),
    procedureType: z.string(),
    language: z.enum(['EN', 'RU', 'UZ']),
    recoveryDay: z.number().int(),
  }),
  outputSchema: z.object({
    chunks: z.array(
      z.object({
        contentKey: z.string(),
        category: z.string(),
        text: z.string(),
      }),
    ),
  }),
  execute: async (inputData) => {
    const chunks = await fetchApprovedContentForAssistant({
      procedureType: inputData.procedureType,
      language: inputData.language as CatalogLanguage,
      recoveryDay: inputData.recoveryDay,
    });
    return { chunks };
  },
});

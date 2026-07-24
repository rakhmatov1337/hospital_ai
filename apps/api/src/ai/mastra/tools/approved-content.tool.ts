import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { fetchApprovedContentKeys } from '../../content-catalog';

/**
 * The CLOSED SET the care-plan selector may choose from.
 *
 * This tool is the safety mechanism of the selection agent: it returns the
 * clinician-APPROVED content-library keys, and the agent is instructed to emit
 * ONLY keys that appear here. The service then re-validates every emitted key
 * against the same catalogue, so a hallucinated key fails closed rather than
 * reaching a plan (defence in depth — the model is never trusted).
 *
 * The query itself lives in ../../content-catalog (Mastra-free) so the service
 * and its tests can validate without loading the agent framework.
 */
export const listApprovedContentTool = createTool({
  id: 'listApprovedContent',
  description:
    'List the clinician-APPROVED content-library keys available for a procedure. The recovery plan may ONLY reference keys returned by this tool — never invent a key, never write patient-facing text.',
  inputSchema: z.object({
    procedureType: z
      .string()
      .describe('e.g. "laparoscopic_appendectomy" or "open_hernia_repair"'),
  }),
  outputSchema: z.object({
    contentKeys: z.array(z.object({ contentKey: z.string(), category: z.string() })),
  }),
  execute: async (inputData) => {
    const contentKeys = await fetchApprovedContentKeys(inputData.procedureType);
    return { contentKeys };
  },
});

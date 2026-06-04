import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { pgVector } from './vectors';
import { kbIngestionWorkflow } from './workflows/kb-ingestion.workflow';

/**
 * Central Mastra instance (also what `mastra dev` Studio loads). Agents,
 * workflows, and scorers are registered here as each phase adds them. The
 * `pgVector` registry name must match the `vectorStoreName` used by KB tools.
 */
export const mastra = new Mastra({
  agents: {},
  workflows: { kbIngestionWorkflow },
  vectors: { pgVector },
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

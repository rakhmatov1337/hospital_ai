import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { pgVector } from './vectors';
import { carePlanAgent } from './agents/care-plan.agent';

/**
 * Central Mastra instance. The `pgVector` registry name must match the
 * `vectorStoreName` used by the KB query tool.
 */
export const mastra = new Mastra({
  agents: { carePlanAgent },
  vectors: { pgVector },
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

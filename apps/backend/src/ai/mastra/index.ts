import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { pgVector } from './vectors';
import { carePlanAgent } from './agents/care-plan.agent';
import { nurseChatAgent } from './agents/nurse-chat.agent';

/**
 * Central Mastra instance (also what `mastra dev` Studio loads). The `pgVector`
 * registry name must match the `vectorStoreName` used by the KB query tool.
 */
export const mastra = new Mastra({
  agents: { carePlanAgent, nurseChatAgent },
  vectors: { pgVector },
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

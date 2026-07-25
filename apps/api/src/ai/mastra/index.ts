import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { carePlanSelectorAgent } from './agents/care-plan-selector.agent';
import { patientAssistantAgent } from './agents/patient-assistant.agent';

/**
 * Central Mastra instance — this is also what `mastra dev` (Mastra Studio,
 * studio.hospital-ai.uz) loads, so the agents can be exercised interactively.
 *
 * Two agents are registered:
 *   - carePlanSelectorAgent — clinician-side, SELECTS approved content keys,
 *     never composes patient text, never reaches a patient response path.
 *   - patientAssistantAgent — the SP7 grounded chat: the SINGLE sanctioned
 *     model→patient surface. It is safe ONLY because the assistant service
 *     wraps every call in a deterministic INPUT red-flag guard and OUTPUT
 *     medical-safety guard (see src/assistant + src/ai/assistant). The agent
 *     alone is NOT the safety boundary — the guards are. The adversarial QA gate
 *     (`pnpm --filter api qa:gate`) asserts the guards wrap it and that no OTHER
 *     patient path touches a model.
 *
 * NOTE: the PORT env var overrides `server.port` — a Studio process must set
 * PORT=4111 or the API's PORT wins and Studio collides with it.
 */
export const mastra = new Mastra({
  server: { port: 4111 },
  agents: { carePlanSelectorAgent, patientAssistantAgent },
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { carePlanSelectorAgent } from './agents/care-plan-selector.agent';

/**
 * Central Mastra instance — this is also what `mastra dev` (Mastra Studio,
 * studio.hospital-ai.uz) loads, so the care-plan selector can be exercised
 * interactively.
 *
 * Deliberately minimal: ONLY the clinician-side selection agent is registered.
 * There is no patient-facing agent, no chat agent, and no model wired to any
 * patient response path — that is the product's safety line, enforced by the
 * adversarial QA gate (`pnpm --filter api qa:gate`).
 *
 * NOTE: the PORT env var overrides `server.port` — a Studio process must set
 * PORT=4111 or the API's PORT wins and Studio collides with it.
 */
export const mastra = new Mastra({
  server: { port: 4111 },
  agents: { carePlanSelectorAgent },
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

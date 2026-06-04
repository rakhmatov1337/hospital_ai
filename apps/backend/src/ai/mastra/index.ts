import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { pgVector } from './vectors';
import { carePlanAgent } from './agents/care-plan.agent';
import { kbIngestionWorkflow } from './workflows/kb-ingestion.workflow';
import { patientOnboardingWorkflow } from './workflows/patient-onboarding.workflow';

/**
 * Central Mastra instance (also what `mastra dev` Studio loads). Agents,
 * workflows, and scorers are registered here as each phase adds them. The
 * `pgVector` registry name must match the `vectorStoreName` used by KB tools.
 * LibSQL storage makes workflow runs durable + inspectable.
 */
export const mastra = new Mastra({
  agents: { carePlanAgent },
  workflows: { kbIngestionWorkflow, patientOnboardingWorkflow },
  vectors: { pgVector },
  storage: new LibSQLStore({ id: 'wf-store', url: 'file:./hospital-mastra.db' }),
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

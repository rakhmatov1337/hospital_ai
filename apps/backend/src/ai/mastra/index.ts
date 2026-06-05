import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { pgVector, pgConnectionString } from './vectors';
import { carePlanAgent } from './agents/care-plan.agent';
import { riskAgent } from './agents/risk.agent';
import { nurseChatAgent } from './agents/nurse-chat.agent';
import { clinicalAdvisorAgent } from './agents/clinical-advisor.agent';
import { kbIngestionWorkflow } from './workflows/kb-ingestion.workflow';
import { patientOnboardingWorkflow } from './workflows/patient-onboarding.workflow';
import { dailyCheckInWorkflow } from './workflows/daily-checkin.workflow';
import {
  medicalSafetyScorer,
  answerRelevancyScorer,
  toxicityScorer,
} from '../evals/scorers';

/**
 * Central Mastra instance (also what `mastra dev` Studio loads). Agents,
 * workflows, and scorers are registered here as each phase adds them. The
 * `pgVector` registry name must match the `vectorStoreName` used by KB tools.
 * Postgres storage makes workflow runs durable + inspectable, and (unlike a
 * local sqlite file) is safe for the api + studio processes to share without
 * SQLITE_BUSY locks.
 */
export const mastra = new Mastra({
  // Studio (`mastra dev`) serves here. NOTE: the PORT env var overrides this —
  // the studio PM2 process must set PORT=4111, or .env's PORT=3012 wins and
  // Studio collides with the API.
  server: { port: 4111 },
  agents: { carePlanAgent, riskAgent, nurseChatAgent, clinicalAdvisorAgent },
  workflows: {
    kbIngestionWorkflow,
    patientOnboardingWorkflow,
    dailyCheckInWorkflow,
  },
  vectors: { pgVector },
  scorers: {
    'medical-safety': medicalSafetyScorer,
    'answer-relevancy-scorer': answerRelevancyScorer(),
    'toxicity-scorer': toxicityScorer(),
  },
  storage: new PostgresStore({
    id: 'wf-store',
    connectionString: pgConnectionString(),
  }),
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

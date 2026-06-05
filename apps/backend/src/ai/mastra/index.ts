import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { pgVector } from './vectors';
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
 * LibSQL storage makes workflow runs durable + inspectable.
 */
export const mastra = new Mastra({
  // Studio (`mastra dev`) serves here — off the API's port 3000 so both run.
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
  storage: new LibSQLStore({ id: 'wf-store', url: 'file:./hospital-mastra.db' }),
  logger: new PinoLogger({ name: 'HospitalAI', level: 'info' }),
});

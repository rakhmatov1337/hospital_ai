/**
 * SP3-A QA scorers — repurposed Mastra evals as deterministic + LLM QA judges.
 * These are the only "AI" reuse in strict-scope-A: scorers as QA judges, no agents.
 */
export {
  scoreMedicalSafety,
  type ScorerLang,
  type MedicalSafetyResult,
} from './medical-safety.scorer';
export { llmJudgeNoJudgment, type LlmJudgeResult } from './llm-judge';

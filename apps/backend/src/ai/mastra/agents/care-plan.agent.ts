import { Agent } from '@mastra/core/agent';
import { FALLBACK_MODELS } from '../providers';
import { kbQueryTool } from '../tools/kb-query.tool';

/**
 * AI-02: care-plan agent. Grounds plans in the cesarean KB (AI-08) via the query
 * tool, over the 3-provider fallback chain (AI-01). Used by care-plan.service which
 * adds the deterministic BE-07 fallback on failure.
 */
export const carePlanAgent = new Agent({
  id: 'care-plan-agent',
  name: 'Care Plan Agent',
  instructions: [
    'You are a post-surgical care planner for cesarean (C-section) recovery.',
    'ALWAYS call searchCesareanKB to ground the plan in real guidelines before answering.',
    'Output a structured recovery plan covering the full period: medications, diet,',
    'activities, check-ups, and restrictions, each with a dayOffset from the surgery date.',
  ].join(' '),
  model: FALLBACK_MODELS,
  tools: { kbQuery: kbQueryTool },
});

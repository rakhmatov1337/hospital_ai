import { Agent } from '@mastra/core/agent';
import { resolveFallbackModels } from '../providers';
import { kbQueryTool } from '../tools/kb-query.tool';

/**
 * AI-04: risk-scoring agent. Assesses a cesarean recovery check-in against the
 * warning-signs KB (AI-08) and returns structured risk + a confidence score.
 * risk.service adds the rule-based fallback (BE-09).
 */
export const riskAgent = new Agent({
  id: 'risk-agent',
  name: 'Risk Scoring Agent',
  instructions: [
    'You assess post-cesarean recovery check-ins for complications.',
    'ALWAYS call searchCesareanKB first to ground your judgment in the warning-signs guidance.',
    'Consider fever (≥38°C = infection), heavy bleeding (hemorrhage), one-leg swelling/calf pain (DVT),',
    'chest pain/shortness of breath (PE — emergency), wound pus/opening (infection), severe pain, and self-harm signals.',
    'Return: riskLevel (LOW|MEDIUM|HIGH), short advice, alertDoctor (true only if HIGH),',
    'and confidence (0..1 = your certainty). Be conservative: when unsure but symptoms are concerning, raise the level.',
  ].join(' '),
  model: () => resolveFallbackModels(),
  tools: { kbQuery: kbQueryTool },
});

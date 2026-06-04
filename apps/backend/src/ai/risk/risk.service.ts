import { riskResultSchema, RiskResult, CheckIn } from './risk.types';

export interface RiskAgent {
  generate(
    prompt: string,
    opts: { structuredOutput: { schema: typeof riskResultSchema } },
  ): Promise<{ object?: unknown }>;
}

export type RiskResponse = RiskResult & { generatedByAi: boolean };

/**
 * Rule-based fallback (BE-09) grounded in the cesarean warning-signs KB. Runs when
 * AI is unavailable so risk scoring + alerts never break.
 */
export function ruleRisk(c: CheckIn): RiskResult {
  const s = (c.symptoms ?? []).join(' ').toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => s.includes(k));
  const reasons: string[] = [];
  let level: RiskResult['riskLevel'] = 'LOW';

  if ((c.temperature ?? 0) >= 38) {
    level = 'HIGH';
    reasons.push('fever ≥38°C (possible infection)');
  }
  if (has('chest pain', 'shortness of breath', 'breathless')) {
    level = 'HIGH';
    reasons.push('possible pulmonary embolism');
  }
  if (has('leg swelling', 'calf', 'one leg')) {
    level = 'HIGH';
    reasons.push('possible DVT');
  }
  if (has('heavy bleeding', 'soaking', 'large clot', 'clots')) {
    level = 'HIGH';
    reasons.push('possible hemorrhage');
  }
  if (has('pus', 'wound open', 'wound opening', 'foul', 'discharge')) {
    level = 'HIGH';
    reasons.push('possible wound/womb infection');
  }
  if (has('self-harm', 'harm myself', 'suicid', 'hurt myself')) {
    level = 'HIGH';
    reasons.push('mental-health emergency');
  }
  if (level !== 'HIGH') {
    if ((c.painLevel ?? 0) >= 8) {
      level = 'MEDIUM';
      reasons.push('severe pain');
    } else if (has('burning urination', 'painful urination')) {
      level = 'MEDIUM';
      reasons.push('possible urinary infection');
    }
  }

  const base =
    level === 'HIGH'
      ? 'These symptoms may be serious — contact your doctor or emergency services now.'
      : level === 'MEDIUM'
        ? 'Monitor closely and contact your doctor if it worsens.'
        : 'This looks within normal recovery. Keep following your care plan.';

  return {
    riskLevel: level,
    advice: reasons.length ? `${base} (${reasons.join('; ')})` : base,
    alertDoctor: level === 'HIGH',
    confidence: 0.6,
  };
}

/**
 * AI-04: AI risk scoring with confidence. Grounded in the warning-signs KB via the
 * agent's tool. On any failure -> rule-based fallback (BE-09). A doctor alert fires
 * only on HIGH risk.
 */
export async function assessRisk(
  agent: RiskAgent,
  c: CheckIn,
): Promise<RiskResponse> {
  try {
    const res = await agent.generate(
      `Assess this cesarean (C-section) recovery check-in and return risk JSON. ` +
        `Recovery day: ${c.recoveryDay ?? 'unknown'}. Pain (0-10): ${c.painLevel}. ` +
        `Temperature °C: ${c.temperature ?? 'n/a'}. Symptoms: ${(c.symptoms ?? []).join(', ') || 'none'}. ` +
        `Mood: ${c.mood ?? 'n/a'}. Notes: ${c.notes ?? 'none'}.`,
      { structuredOutput: { schema: riskResultSchema } },
    );
    const parsed = riskResultSchema.parse(res.object);
    return {
      ...parsed,
      alertDoctor: parsed.alertDoctor && parsed.riskLevel === 'HIGH',
      generatedByAi: true,
    };
  } catch {
    return { ...ruleRisk(c), generatedByAi: false };
  }
}

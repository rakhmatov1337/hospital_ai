import { Tier } from '@hospital-ai/shared-types';
import { TierEngine, TierRule, AnswerMap, AnswerValue } from './tier-engine';

/**
 * Fixtures: the `placeholder-v1` EscalationRule set VERBATIM from the SP1 seed
 * (`src/seed/seed.ts` → seedEscalationRules). The engine must reproduce the
 * clinic's intended tiering exactly, so the tests evaluate the real seeded DSL.
 */
const PLACEHOLDER_V1_RULES: TierRule[] = [
  {
    version: 'placeholder-v1',
    tier: Tier.emergency,
    conditions: {
      anyOf: [
        {
          q: 'q5_redflags',
          op: 'includesAny',
          values: [
            'difficulty_breathing',
            'chest_pain',
            'confusion',
            'very_hard_to_stay_awake',
            'heavy_bleeding',
          ],
        },
        { q: 'q4_wound', op: 'eq', value: 'opening' },
      ],
    },
  },
  {
    version: 'placeholder-v1',
    tier: Tier.urgent,
    conditions: {
      anyOf: [
        { q: 'q1_temp', op: 'eq', value: '38_5_or_above' },
        { q: 'q5_redflags', op: 'includesAny', values: ['chills', 'new_calf_pain'] },
        { q: 'q4_wound', op: 'in', values: ['very_red_or_spreading', 'leaking'] },
        { q: 'q2_pain', op: 'gte', value: 8 },
        {
          allOf: [
            { q: 'q3_pain_change', op: 'eq', value: 'worse' },
            { q: 'q2_pain', op: 'gte', value: 6 },
          ],
        },
        { q: 'q6_intake', op: 'eq', value: 'no' },
        { q: 'q7_urine', op: 'eq', value: 'no' },
      ],
    },
  },
  { version: 'placeholder-v1', tier: Tier.routine, conditions: { default: true } },
];

/** A fully-normal check-in — every question answered, nothing triggers a rule. */
function baseline(): AnswerMap {
  return {
    q1_temp: 'under_37_5',
    q2_pain: 3,
    q3_pain_change: 'better',
    q4_wound: 'normal',
    q5_redflags: ['none'],
    q6_intake: 'yes',
    q7_urine: 'yes',
  };
}

/** Baseline with a single field overridden (isolate one clause per test). */
function withAnswer(patch: Record<string, AnswerValue>): AnswerMap {
  return { ...baseline(), ...patch };
}

const assign = (answers: AnswerMap) => TierEngine.assign(answers, PLACEHOLDER_V1_RULES);

describe('TierEngine (placeholder-v1)', () => {
  describe('EMERGENCY triggers', () => {
    const EMERGENCY_REDFLAGS = [
      'difficulty_breathing',
      'chest_pain',
      'confusion',
      'very_hard_to_stay_awake',
      'heavy_bleeding',
    ];

    it.each(EMERGENCY_REDFLAGS)('q5_redflags including "%s" → emergency', (code) => {
      const result = assign(withAnswer({ q5_redflags: [code] }));
      expect(result.tier).toBe(Tier.emergency);
      expect(result.ruleVersion).toBe('placeholder-v1');
    });

    it('q5_redflags including an emergency code alongside others → emergency', () => {
      expect(assign(withAnswer({ q5_redflags: ['chills', 'chest_pain'] })).tier).toBe(
        Tier.emergency,
      );
    });

    it('q4_wound = "opening" → emergency', () => {
      expect(assign(withAnswer({ q4_wound: 'opening' })).tier).toBe(Tier.emergency);
    });
  });

  describe('URGENT triggers', () => {
    it('q1_temp = "38_5_or_above" → urgent', () => {
      const r = assign(withAnswer({ q1_temp: '38_5_or_above' }));
      expect(r.tier).toBe(Tier.urgent);
      expect(r.ruleVersion).toBe('placeholder-v1');
    });

    it.each(['chills', 'new_calf_pain'])('q5_redflags including "%s" → urgent', (code) => {
      expect(assign(withAnswer({ q5_redflags: [code] })).tier).toBe(Tier.urgent);
    });

    it.each(['very_red_or_spreading', 'leaking'])('q4_wound = "%s" → urgent', (code) => {
      expect(assign(withAnswer({ q4_wound: code })).tier).toBe(Tier.urgent);
    });

    it('q2_pain = 8 (gte boundary) → urgent', () => {
      expect(assign(withAnswer({ q2_pain: 8 })).tier).toBe(Tier.urgent);
    });

    it('q2_pain = 10 → urgent', () => {
      expect(assign(withAnswer({ q2_pain: 10 })).tier).toBe(Tier.urgent);
    });

    it('q2_pain = 7 alone → routine (below the gte-8 threshold)', () => {
      expect(assign(withAnswer({ q2_pain: 7 })).tier).toBe(Tier.routine);
    });

    it('q2_pain as a numeric string "8" → urgent (wire-format robustness)', () => {
      expect(assign(withAnswer({ q2_pain: '8' as unknown as number })).tier).toBe(Tier.urgent);
    });

    it('q6_intake = "no" → urgent', () => {
      expect(assign(withAnswer({ q6_intake: 'no' })).tier).toBe(Tier.urgent);
    });

    it('q7_urine = "no" → urgent', () => {
      expect(assign(withAnswer({ q7_urine: 'no' })).tier).toBe(Tier.urgent);
    });
  });

  describe('the allOf clause: q3_pain_change = "worse" AND q2_pain >= 6', () => {
    it('worse + pain 6 (boundary) → urgent', () => {
      expect(assign(withAnswer({ q3_pain_change: 'worse', q2_pain: 6 })).tier).toBe(Tier.urgent);
    });

    it('worse + pain 7 → urgent', () => {
      expect(assign(withAnswer({ q3_pain_change: 'worse', q2_pain: 7 })).tier).toBe(Tier.urgent);
    });

    it('worse + pain 5 → routine (pain below 6, no other trigger)', () => {
      expect(assign(withAnswer({ q3_pain_change: 'worse', q2_pain: 5 })).tier).toBe(Tier.routine);
    });

    it('same + pain 7 → routine (not "worse", and 7 < gte-8)', () => {
      expect(assign(withAnswer({ q3_pain_change: 'same', q2_pain: 7 })).tier).toBe(Tier.routine);
    });
  });

  describe('ROUTINE fallthrough', () => {
    it('a fully-normal check-in → routine with the deciding rule_version', () => {
      const r = assign(baseline());
      expect(r.tier).toBe(Tier.routine);
      expect(r.ruleVersion).toBe('placeholder-v1');
    });

    it('q5_redflags = ["none"] does not trigger any tier', () => {
      expect(assign(withAnswer({ q5_redflags: ['none'] })).tier).toBe(Tier.routine);
    });

    it('a little wound redness alone → routine (not in the urgent set)', () => {
      expect(assign(withAnswer({ q4_wound: 'a_little_red' })).tier).toBe(Tier.routine);
    });
  });

  describe('highest matching tier wins', () => {
    it('emergency + urgent triggers together → emergency', () => {
      const r = assign(
        withAnswer({ q4_wound: 'opening', q1_temp: '38_5_or_above', q2_pain: 9 }),
      );
      expect(r.tier).toBe(Tier.emergency);
    });

    it('emergency redflag + high pain (urgent) → emergency', () => {
      expect(assign(withAnswer({ q5_redflags: ['heavy_bleeding'], q2_pain: 9 })).tier).toBe(
        Tier.emergency,
      );
    });

    it('urgent + routine (default always matches) → urgent, not routine', () => {
      expect(assign(withAnswer({ q6_intake: 'no' })).tier).toBe(Tier.urgent);
    });
  });

  describe('engine invariants', () => {
    it('throws when no rule matches (no default routine rule present)', () => {
      const noDefault: TierRule[] = [
        {
          version: 'x',
          tier: Tier.urgent,
          conditions: { q: 'q1_temp', op: 'eq', value: '38_5_or_above' },
        },
      ];
      expect(() => TierEngine.assign(baseline(), noDefault)).toThrow(/no escalation rule matched/);
    });
  });
});

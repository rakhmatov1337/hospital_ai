/**
 * SP3-A QA gate — Layer 1 (Architectural, A1–A5).
 *
 * "Test the architecture first — a guarantee you can prove by reading the code
 * beats a behaviour you can only sample." Each case is the deterministic check
 * from run-gate.ts, wrapped as a Jest test so it also runs in CI via
 * `pnpm --filter api test`. The gate runner (run-gate.ts) aggregates the same
 * results and records the diligence run-log.
 */

import { checkLayer1, resultsById, type CaseResult } from './run-gate';
import { validateAnswers, contentKeyForTier } from '../../checkins/checkins.service';
import { CONTENT_KEY_PATTERN } from '../../plans/care-plan-assembler';
import { Tier } from '@hospital-ai/shared-types';

describe('Layer 1 — Architectural (A1–A6)', () => {
  let byId: Map<string, CaseResult>;

  beforeAll(async () => {
    byId = resultsById(await checkLayer1());
  });

  const expectPass = (id: string) => {
    const r = byId.get(id);
    expect(r).toBeDefined();
    // Surface the diagnostic note on failure.
    expect(r?.pass ? '' : `${id}: ${r?.note}`).toBe('');
    expect(r?.pass).toBe(true);
  };

  it('A1 — no free-text input reaches a model (structured-only, POST /v1/checkins rejects free text)', () => {
    expectPass('A1');
  });

  it('A2 — no model output renders in patient UI (only content keys + categoricals)', () => {
    expectPass('A2');
  });

  it('A3 — patient strings come only from the signed content library', () => {
    expectPass('A3');
  });

  it('A4 — unapproved / placeholder content fails closed', () => {
    expectPass('A4');
  });

  it('A5 — survey free-text is write-only (never read by a patient-output path)', () => {
    expectPass('A5');
  });

  it('A6 — the assistant is the single sanctioned model→patient path, guarded on input and output (EN/RU/UZ)', () => {
    expectPass('A6');
  });

  // --- Direct corroborating assertions (independent of the aggregate result) ---

  it('the check-in validator rejects a free-text answer value', () => {
    const answers = [
      { ref: 'q1_temp', value: 'under_37_5' },
      { ref: 'q2_pain', value: 3 },
      { ref: 'q3_pain_change', value: 'same' },
      { ref: 'q4_wound', value: 'my wound is red and warm, is it infected?' },
      { ref: 'q5_redflags', value: ['none'] },
      { ref: 'q6_intake', value: 'yes' },
      { ref: 'q7_urine', value: 'yes' },
    ];
    expect(() => validateAnswers(answers)).toThrow();
  });

  it('every tier→content output is a content-library key, never a literal', () => {
    for (const tier of [Tier.emergency, Tier.urgent, Tier.routine]) {
      for (const within of [true, false]) {
        const key = contentKeyForTier(tier, within);
        expect(CONTENT_KEY_PATTERN.test(key)).toBe(true);
      }
    }
  });
});

/**
 * SP3-A QA gate — Layer 3 (Escalation integrity, C1–C6).
 *
 * The safety net behind the "no medical judgment" guarantee: when a check-in flags
 * a concern, it must reach a human, and that path can never be suppressed, hidden,
 * downgraded, edited, or silently dropped. Each case is the deterministic check
 * from run-gate.ts, wrapped as a Jest test for CI.
 */

import { checkLayer3, resultsById, type CaseResult } from './run-gate';
import { TierEngine } from '../../checkins/tier-engine';
import { assertForwardTransition } from '../../escalations/escalations.repository';
import { EscalationStatus } from '@hospital-ai/shared-types';

describe('Layer 3 — Escalation integrity (C1–C6)', () => {
  let byId: Map<string, CaseResult>;

  beforeAll(async () => {
    byId = resultsById(await checkLayer3());
  });

  const expectPass = (id: string) => {
    const r = byId.get(id);
    expect(r).toBeDefined();
    expect(r?.pass ? '' : `${id}: ${r?.note}`).toBe('');
    expect(r?.pass).toBe(true);
  };

  it('C1 — every emergency trigger surfaces the emergency content key + is logged', () => {
    expectPass('C1');
  });

  it('C2 — the queue never hides, delays, or deprioritises an unresolved urgent', () => {
    expectPass('C2');
  });

  it('C3 — an input matching no rule routes to staff (tier engine is fail-loud)', () => {
    expectPass('C3');
  });

  it('C4 — the six safety strings resolve in EN/UZ/RU (UZ/RU flagged placeholder)', () => {
    expectPass('C4');
  });

  it('C5 — the escalation log is append-only (no edit / delete / backward move)', () => {
    expectPass('C5');
  });

  it('C6 — out-of-hours message is correct and the emergency tier still functions', () => {
    expectPass('C6');
  });

  // --- Direct corroborating assertions ---

  it('TierEngine.assign throws when no rule matches (fail-loud, never a silent routine)', () => {
    expect(() => TierEngine.assign({ q4_wound: 'normal' }, [])).toThrow();
  });

  it('escalation status is forward-only (backward and same transitions are rejected)', () => {
    expect(() =>
      assertForwardTransition(EscalationStatus.acknowledged, EscalationStatus.new),
    ).toThrow();
    expect(() =>
      assertForwardTransition(EscalationStatus.new, EscalationStatus.new),
    ).toThrow();
    expect(() =>
      assertForwardTransition(EscalationStatus.new, EscalationStatus.acknowledged),
    ).not.toThrow();
  });
});

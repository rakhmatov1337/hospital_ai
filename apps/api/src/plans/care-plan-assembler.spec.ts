import { assertSelectionOnly, isContentKey } from './care-plan-assembler';
import { buildPlanItemTemplates } from './task-generation.service';
import { PLAN_TEMPLATES } from '../seed/plan-templates';
import { buildContentPack } from '../seed/content-pack';

/**
 * SP3-A §2 — care-plan selection audit + guard.
 *
 * Proves the enforced invariant: the patient programme is assembled by SELECTING
 * approved content-library items, never by composing text. Two halves:
 *   1. Audit — every seeded PlanItem.content_ref resolves to a real content key
 *      from the content pack (no orphan refs, no literals).
 *   2. Guard — assertSelectionOnly throws on a synthetic "compose" item.
 */

describe('care-plan selection audit', () => {
  const procedureTypes = PLAN_TEMPLATES.map((t) => t.procedureType);

  // The full set of approved content-library keys the seed persists.
  const contentKeys = new Set(
    buildContentPack(procedureTypes).map((e) => e.contentKey),
  );

  // Every PlanItem the seed materialises, across all seeded plan templates.
  const allPlanItems = procedureTypes.flatMap((p) => buildPlanItemTemplates(p));

  it('materialises plan items to audit', () => {
    expect(allPlanItems.length).toBeGreaterThan(0);
    expect(contentKeys.size).toBeGreaterThan(0);
  });

  it('every seeded PlanItem.content_ref resolves to a real content key (no orphans)', () => {
    const orphans = allPlanItems
      .map((i) => i.contentRef)
      .filter((ref) => !contentKeys.has(ref));
    expect(orphans).toEqual([]);
  });

  it('every seeded PlanItem.content_ref is a content-library key, never a literal', () => {
    for (const item of allPlanItems) {
      expect(isContentKey(item.contentRef)).toBe(true);
    }
  });

  it('assertSelectionOnly passes the real seeded plan items unchanged', () => {
    expect(() => assertSelectionOnly(allPlanItems)).not.toThrow();
  });
});

describe('assertSelectionOnly (guard)', () => {
  it('throws on a synthetic compose item carrying inline free text', () => {
    const composed = [
      { contentRef: 'medication.paracetamol_500' },
      // A composed literal — patient-visible prose, not a library key.
      { contentRef: "It's probably fine, just take another painkiller." },
    ];
    expect(() => assertSelectionOnly(composed)).toThrow();
    try {
      assertSelectionOnly(composed);
      fail('expected assertSelectionOnly to throw');
    } catch (err) {
      expect(err).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { index: 1, reason: 'inline_free_text' },
      });
    }
  });

  it('throws when a plan item has no content_ref', () => {
    expect(() => assertSelectionOnly([{}])).toThrow();
    try {
      assertSelectionOnly([{ contentRef: 'wound_care.daily' }, {}]);
      fail('expected assertSelectionOnly to throw');
    } catch (err) {
      expect(err).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { index: 1, reason: 'missing_content_ref' },
      });
    }
  });

  it('throws when content_ref is empty or whitespace-only', () => {
    expect(() => assertSelectionOnly([{ contentRef: '' }])).toThrow();
    expect(() => assertSelectionOnly([{ contentRef: '   ' }])).toThrow();
  });

  it('is a no-op for an empty plan', () => {
    expect(() => assertSelectionOnly([])).not.toThrow();
  });
});

describe('isContentKey', () => {
  it('accepts well-formed content-library keys', () => {
    for (const key of [
      'wound_care.daily',
      'medication.paracetamol_500',
      'activity.gentle_movement',
      'clinical.laparoscopic_appendectomy.day_1',
      'checkin.q1_temp',
    ]) {
      expect(isContentKey(key)).toBe(true);
    }
  });

  it('rejects inline free text and malformed refs', () => {
    for (const notKey of [
      'Take Paracetamol 500 mg for pain relief.',
      "just tell me it's nothing",
      'Wound Care Daily',
      'nodot',
      '.leading',
      'trailing.',
      '',
    ]) {
      expect(isContentKey(notKey)).toBe(false);
    }
  });
});

import type { Agent } from '@mastra/core/agent';
import { ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../../common/errors';
import { PlanDraftService, type PlanDraftItem } from './plan-draft.service';

/**
 * The care-plan selector's safety contract: it may SELECT approved content keys,
 * never compose. These tests prove the server-side guard holds even when the
 * model misbehaves — a hallucinated or unapproved key must fail the draft CLOSED.
 * No LLM and no database are touched.
 */

const APPROVED = [
  { contentKey: 'medication.paracetamol_500', category: 'medication' },
  { contentKey: 'wound_care.daily', category: 'wound_care' },
  { contentKey: 'checkin.daily', category: 'checkin' },
  { contentKey: 'clinical.laparoscopic_appendectomy.day_1', category: 'clinical' },
  // A DIFFERENT procedure's clinical key — must not be selectable below.
  { contentKey: 'clinical.open_hernia_repair.day_1', category: 'clinical' },
];

function fakePrisma() {
  return {
    contentItem: { findMany: jest.fn().mockResolvedValue(APPROVED) },
  } as never;
}

function item(contentRef: string, over: Partial<PlanDraftItem> = {}): PlanDraftItem {
  return {
    recoveryDay: 1,
    taskType: 'medication',
    contentRef,
    scheduledTime: '08:00',
    windowMinutes: 60,
    ...over,
  };
}

function fakeAgent(items: PlanDraftItem[], rationale = 'staff-only note'): Agent {
  return {
    generate: jest.fn().mockResolvedValue({ object: { items, rationale } }),
  } as unknown as Agent;
}

describe('PlanDraftService — select-only guardrail', () => {
  let service: PlanDraftService;
  const OLD_KEY = process.env.OPENAI_API_KEY;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-key-not-used';
  });
  afterAll(() => {
    if (OLD_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = OLD_KEY;
  });

  beforeEach(() => {
    service = new PlanDraftService(fakePrisma());
  });

  const allowed = new Set(APPROVED.map((a) => a.contentKey));

  it('accepts a draft whose keys are all approved', () => {
    expect(() =>
      service.assertOnlyApprovedKeys([item('medication.paracetamol_500')], allowed),
    ).not.toThrow();
  });

  it('REJECTS a hallucinated content key (fails closed)', () => {
    try {
      service.assertOnlyApprovedKeys([item('medication.tramadol_invented')], allowed);
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ERROR_CODES.CONTENT_NOT_APPROVED);
    }
  });

  it('REJECTS an item that composed text instead of selecting a key', () => {
    try {
      service.assertOnlyApprovedKeys(
        [item('Take two paracetamol with food and rest.')],
        allowed,
      );
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      // assertSelectionOnly rejects non-key refs before the closed-set check.
      expect([ERROR_CODES.VALIDATION_ERROR, ERROR_CODES.CONTENT_NOT_APPROVED]).toContain(
        (err as AppError).code,
      );
    }
  });

  it('end-to-end: a model that invents a key cannot produce a draft', async () => {
    const agent = fakeAgent([item('clinical.laparoscopic_appendectomy.totally_made_up')]);
    await expect(
      service.draft('laparoscopic_appendectomy', agent),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONTENT_NOT_APPROVED });
  });

  it('end-to-end: a well-behaved selection is returned as a DRAFT', async () => {
    const agent = fakeAgent([
      item('medication.paracetamol_500'),
      item('wound_care.daily', { taskType: 'wound_care', scheduledTime: '09:00' }),
      item('clinical.laparoscopic_appendectomy.day_1', {
        taskType: 'education',
        scheduledTime: '10:00',
      }),
    ]);
    const result = await service.draft('laparoscopic_appendectomy', agent);

    expect(result.status).toBe('draft');
    expect(result.itemCount).toBe(3);
    expect(result.rationale).toBe('staff-only note');
    // Every emitted ref is an approved library key — never composed prose.
    result.items.forEach((i) => expect(allowed.has(i.contentRef)).toBe(true));
  });

  it("cannot select another procedure's clinical content", async () => {
    const agent = fakeAgent([
      item('clinical.open_hernia_repair.day_1', { taskType: 'education' }),
    ]);
    await expect(
      service.draft('laparoscopic_appendectomy', agent),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONTENT_NOT_APPROVED });
  });
});

import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import type { PrismaClient } from '@prisma/client';
import { ERROR_CODES } from '@hospital-ai/shared-types';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors';
import { assertSelectionOnly } from '../../plans/care-plan-assembler';
import { fetchApprovedContentKeys } from '../content-catalog';
import { hasConfiguredProvider, primaryModel } from '../mastra/providers';

/**
 * Runs the care-plan SELECTION agent and re-validates its output.
 *
 * The safety contract (AI-safety-line KB + Dev Build Board "select from approved
 * library, never compose"):
 *   - the agent emits content KEYS + days/times — never patient-facing prose;
 *   - EVERY emitted key is re-checked here against the approved content library,
 *     so a hallucinated or unapproved key fails the whole draft CLOSED;
 *   - the result is a DRAFT for a clinician to approve — it is never persisted
 *     as a live plan and never reaches a patient response path.
 */

export const planDraftItemSchema = z.object({
  recoveryDay: z.number().int().min(0).max(30),
  taskType: z.enum(['medication', 'activity', 'wound_care', 'education', 'checkin']),
  contentRef: z.string(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
  windowMinutes: z.number().int().positive().max(1440),
});

export const planDraftSchema = z.object({
  items: z.array(planDraftItemSchema).min(1),
  /** Staff-only note for the reviewing clinician. NEVER shown to a patient. */
  rationale: z.string(),
});

export type PlanDraftItem = z.infer<typeof planDraftItemSchema>;
export type PlanDraft = z.infer<typeof planDraftSchema>;

export interface PlanDraftResult extends PlanDraft {
  procedureType: string;
  itemCount: number;
  model: string;
  status: 'draft';
  approvedKeyCount: number;
}

@Injectable()
export class PlanDraftService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fail-closed validation: reject the draft unless every contentRef is a real,
   * approved library key. Pure + exported shape so it is unit-testable without
   * calling an LLM.
   */
  assertOnlyApprovedKeys(items: PlanDraftItem[], allowed: ReadonlySet<string>): void {
    // 1) Structural: each item must be a library selection, not composed text.
    assertSelectionOnly(items);

    // 2) Closed-set: the key must actually exist and be approved.
    const unknown = [...new Set(items.map((i) => i.contentRef))].filter((k) => !allowed.has(k));
    if (unknown.length > 0) {
      throw new AppError(
        ERROR_CODES.CONTENT_NOT_APPROVED,
        'The care-plan selector emitted content keys that are not in the approved library. ' +
          'The draft was rejected — the AI may only SELECT approved content, never invent it.',
        { unknownKeys: unknown },
      );
    }
  }

  /**
   * The real Mastra agent, loaded LAZILY — `@mastra/core` pulls ESM-only deps, so
   * importing it eagerly would drag the agent framework into every consumer (and
   * into Jest). Tests inject a fake agent and never reach this.
   */
  private async resolveAgent(): Promise<Agent> {
    const mod = await import('../mastra/agents/care-plan-selector.agent');
    return mod.carePlanSelectorAgent;
  }

  /**
   * Produce a draft recovery-plan template for a procedure.
   * `agent` is injectable so tests can drive it without an LLM.
   */
  async draft(procedureType: string, agent?: Agent): Promise<PlanDraftResult> {
    if (!hasConfiguredProvider()) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'No AI provider is configured — set OPENAI_API_KEY to use the care-plan selector.',
      );
    }

    const approved = await fetchApprovedContentKeys(
      procedureType,
      this.prisma as unknown as PrismaClient,
    );
    if (approved.length === 0) {
      throw new AppError(
        ERROR_CODES.CONTENT_NOT_APPROVED,
        `No approved content exists for procedure "${procedureType}" — nothing to select from.`,
        { procedureType },
      );
    }
    const allowed = new Set(approved.map((a) => a.contentKey));

    const prompt =
      `Procedure: ${procedureType}\n` +
      `Programme length: 30 days (day 0 = discharge).\n` +
      `Call listApprovedContent for this procedure first, then assemble the draft plan ` +
      `using ONLY the content keys it returns.`;

    const selector = agent ?? (await this.resolveAgent());
    const result = await selector.generate(prompt, {
      structuredOutput: { schema: planDraftSchema },
    });

    const object = result.object as PlanDraft | undefined;
    if (!object?.items?.length) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'The care-plan selector returned no plan items.',
      );
    }

    this.assertOnlyApprovedKeys(object.items, allowed);

    return {
      ...object,
      procedureType,
      itemCount: object.items.length,
      model: primaryModel(),
      status: 'draft',
      approvedKeyCount: allowed.size,
    };
  }
}

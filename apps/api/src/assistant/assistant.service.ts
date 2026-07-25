import { Injectable } from '@nestjs/common';
import type { Agent } from '@mastra/core/agent';
import { ERROR_CODES, Language } from '@hospital-ai/shared-types';
import { Patient, Clinic } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/request-context';
import { Clock } from '../common/clock';
import { AppError } from '../common/errors';
import { ContentService } from '../content/content.service';
import { TelemetryService, TelemetryMeta } from '../telemetry/telemetry.service';
import { recoveryDay } from '../plans/recovery-day';
import { clinicLocalOffset } from '../checkins/clinic-hours';
import { hasConfiguredProvider } from '../ai/mastra/providers';
import { detectRedFlags, EMERGENCY_CONTENT_KEY, type AssistantLang } from '../ai/assistant/red-flags';
import {
  StreamingOutputGuard,
  guardFullReply,
  GUARD_FALLBACK_CONTENT_KEY,
  type GuardVerdict,
} from '../ai/assistant/output-guard';
import type { ScorerLang } from '../ai/scorers/medical-safety.scorer';

type ScopedPatient = Patient & { clinic: Clinic };

/** A single chunk emitted over SSE to the app. */
export interface AssistantChunk {
  /** 'delta' streams safe text; 'done' ends; 'error' reports a failure. */
  type: 'delta' | 'done' | 'error';
  text?: string;
  /** On 'done': the guard verdict + any grounding content refs (audit/UX). */
  verdict?: GuardVerdict;
  contentRefs?: string[];
  /** On 'done' when replaced/red-flag: the approved content key the app resolves. */
  contentKey?: string;
  code?: string;
}

const LANG_TO_SCORER: Record<Language, ScorerLang & AssistantLang> = {
  [Language.EN]: 'en',
  [Language.RU]: 'ru',
  [Language.UZ]: 'uz',
};

/**
 * SP7 patient-assistant orchestration — the single sanctioned model→patient path.
 *
 * Every message flows: INPUT red-flag guard → (grounded agent stream) → OUTPUT
 * medical-safety guard → persist + telemetry. The guards are deterministic and
 * the model cannot bypass them:
 *   - a red-flag message never reaches the model; the approved emergency content
 *     is surfaced instead;
 *   - any model sentence that strays into judgment is withheld and the reply is
 *     replaced with approved "contact your clinic" content.
 *
 * `stream()` yields {@link AssistantChunk}s the controller writes as SSE.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly clock: Clock,
    private readonly content: ContentService,
    private readonly telemetry: TelemetryService,
  ) {}

  /** True when the assistant can run (an AI provider key is configured). */
  isEnabled(): boolean {
    return hasConfiguredProvider();
  }

  // -------------------------------------------------------------------------
  // Threads
  // -------------------------------------------------------------------------
  async listThreads(): Promise<Array<{ id: string; title: string | null; updatedAt: string }>> {
    const patient = await this.loadScopedPatient();
    const threads = await this.prisma.assistantThread.findMany({
      where: { patientId: patient.id, clinicId: patient.clinicId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    });
    return threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt.toISOString() }));
  }

  async createThread(): Promise<{ id: string }> {
    const patient = await this.loadScopedPatient();
    const thread = await this.prisma.assistantThread.create({
      data: { patientId: patient.id, clinicId: patient.clinicId },
      select: { id: true },
    });
    return thread;
  }

  async getThread(threadId: string): Promise<{
    id: string;
    messages: Array<{ role: string; content: string; contentRefs: string[]; createdAt: string }>;
  }> {
    const patient = await this.loadScopedPatient();
    const thread = await this.loadScopedThread(threadId, patient);
    const messages = await this.prisma.assistantMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, contentRefs: true, createdAt: true },
    });
    return {
      id: thread.id,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        contentRefs: (m.contentRefs as string[]) ?? [],
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // The message flow
  // -------------------------------------------------------------------------
  /**
   * Handle one patient message, yielding SSE chunks. `agent` is injectable so
   * tests drive the flow without an LLM.
   */
  async *stream(
    input: { threadId?: string; message: string },
    agent?: Agent,
  ): AsyncGenerator<AssistantChunk> {
    const patient = await this.loadScopedPatient();
    const now = this.clock.now();
    const day = recoveryDay(patient.dischargeDate, now, patient.clinic.timezone);
    const lang = patient.language as Language;
    const scorerLang = LANG_TO_SCORER[lang];

    const thread = input.threadId
      ? await this.loadScopedThread(input.threadId, patient)
      : await this.prisma.assistantThread.create({
          data: { patientId: patient.id, clinicId: patient.clinicId },
        });

    // Prior turns become the model's memory (persisted in OUR Postgres, not a
    // Mastra store) — fetched BEFORE the current message is written so it is not
    // duplicated in the transcript.
    const history = await this.threadHistory(thread.id);

    await this.persistMessage(thread.id, 'user', input.message, [], null);
    await this.telemetry.emit(
      'assistant_message_sent',
      { language: lang, recovery_day: day, thread_id: thread.id },
      this.meta(patient, day, now),
    );

    // 1) INPUT GUARD — red flags never reach the model.
    const redFlag = detectRedFlags(input.message, scorerLang);
    if (redFlag.triggered) {
      const body = await this.resolveApproved(EMERGENCY_CONTENT_KEY, patient, lang);
      await this.persistMessage(thread.id, 'assistant', body, [EMERGENCY_CONTENT_KEY], 'red_flag_bypass');
      await this.telemetry.emit(
        'assistant_emergency_surfaced',
        { language: lang, recovery_day: day },
        this.meta(patient, day, now),
      );
      yield { type: 'delta', text: body };
      yield {
        type: 'done',
        verdict: 'red_flag_bypass',
        contentKey: EMERGENCY_CONTENT_KEY,
        contentRefs: [EMERGENCY_CONTENT_KEY],
      };
      return;
    }

    // Feature gate: no model configured -> route to clinic, never fail silently.
    if (!this.isEnabled()) {
      const body = await this.resolveApproved(GUARD_FALLBACK_CONTENT_KEY, patient, lang);
      await this.persistMessage(thread.id, 'assistant', body, [GUARD_FALLBACK_CONTENT_KEY], 'replaced');
      yield { type: 'delta', text: body };
      yield { type: 'done', verdict: 'replaced', contentKey: GUARD_FALLBACK_CONTENT_KEY };
      return;
    }

    // 2) GROUNDED AGENT — recent turns folded into the prompt as memory.
    const selector = agent ?? (await this.resolveAgent());
    const guard = new StreamingOutputGuard(scorerLang);
    let full = '';

    const transcript = history
      .map((h) => `${h.role === 'user' ? 'Patient' : 'Assistant'}: ${h.content}`)
      .join('\n');
    const prompt =
      (transcript ? `Conversation so far:\n${transcript}\n\n` : '') +
      `Patient language: ${lang}. Procedure: ${patient.procedureType}. Recovery day: ${day}.\n` +
      `Question: ${input.message}`;

    try {
      const result = await selector.stream(prompt);

      // 3) OUTPUT GUARD — release only whole, safe sentences.
      for await (const token of result.textStream) {
        const safe = guard.push(token);
        if (guard.blocked) break;
        if (safe) {
          full += safe;
          yield { type: 'delta', text: safe };
        }
      }
      if (!guard.blocked) {
        const tail = guard.flush();
        if (tail) {
          full += tail;
          yield { type: 'delta', text: tail };
        }
      }
    } catch (err) {
      // Model/transport failure -> route to clinic, never a false answer.
      const body = await this.resolveApproved(GUARD_FALLBACK_CONTENT_KEY, patient, lang);
      await this.persistMessage(thread.id, 'assistant', body, [GUARD_FALLBACK_CONTENT_KEY], 'replaced');
      yield { type: 'error', code: ERROR_CODES.INTERNAL_ERROR };
      yield { type: 'delta', text: body };
      yield { type: 'done', verdict: 'replaced', contentKey: GUARD_FALLBACK_CONTENT_KEY };
      return;
    }

    // Final whole-message check (defence in depth over the streaming guard).
    const finalUnsafe = guard.blocked || !guardFullReply(full, scorerLang).safe;
    if (finalUnsafe || full.trim().length === 0) {
      const body = await this.resolveApproved(GUARD_FALLBACK_CONTENT_KEY, patient, lang);
      await this.persistMessage(thread.id, 'assistant', body, [GUARD_FALLBACK_CONTENT_KEY], 'replaced');
      await this.telemetry.emit(
        'assistant_refused',
        { reason: 'guard_block', language: lang },
        this.meta(patient, day, now),
      );
      // The unsafe partial was withheld; tell the app to show approved content.
      yield { type: 'done', verdict: 'replaced', contentKey: GUARD_FALLBACK_CONTENT_KEY };
      return;
    }

    await this.persistMessage(thread.id, 'assistant', full, [], 'passed');
    await this.telemetry.emit(
      'assistant_grounded',
      { language: lang, recovery_day: day },
      this.meta(patient, day, now),
    );
    yield { type: 'done', verdict: 'passed' };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private async resolveApproved(key: string, patient: ScopedPatient, lang: Language): Promise<string> {
    // Interpolate the clinic tokens (name/phone/emergency) like every other
    // patient-visible body. Fail-closed if the content is not approved.
    const resolved = await this.content.resolveInterpolated(key, lang, patient.clinic);
    return resolved.text;
  }

  private async threadHistory(
    threadId: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const rows = await this.prisma.assistantMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
      // Keep the window small for a mid-range device + cost; recent turns only.
      take: 20,
    });
    return rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
  }

  private async persistMessage(
    threadId: string,
    role: 'user' | 'assistant',
    content: string,
    contentRefs: string[],
    guardVerdict: GuardVerdict | null,
  ): Promise<void> {
    await this.prisma.assistantMessage.create({
      data: { threadId, role, content, contentRefs, guardVerdict },
    });
    await this.prisma.assistantThread.update({
      where: { id: threadId },
      data: { updatedAt: this.clock.now() },
    });
  }

  private async resolveAgent(): Promise<Agent> {
    const mod = await import('../ai/mastra/agents/patient-assistant.agent');
    return mod.patientAssistantAgent;
  }

  private async loadScopedPatient(): Promise<ScopedPatient> {
    const patientId = this.ctx.patientId;
    if (!patientId) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'A patient token is required for this action.');
    }
    const clinicId = this.ctx.requireClinicId();
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { clinic: true },
    });
    if (!patient) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Patient not found.', { patientId });
    }
    if (patient.clinicId !== clinicId) {
      throw new AppError(
        ERROR_CODES.CROSS_CLINIC_FORBIDDEN,
        'Patient does not belong to the authenticated clinic.',
      );
    }
    return patient as ScopedPatient;
  }

  private async loadScopedThread(
    threadId: string,
    patient: ScopedPatient,
  ): Promise<{ id: string }> {
    const thread = await this.prisma.assistantThread.findUnique({
      where: { id: threadId },
      select: { id: true, patientId: true, clinicId: true },
    });
    if (!thread || thread.patientId !== patient.id || thread.clinicId !== patient.clinicId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Conversation not found.', { threadId });
    }
    return { id: thread.id };
  }

  private meta(patient: ScopedPatient, day: number, now: Date): TelemetryMeta {
    return {
      clinicId: patient.clinicId,
      patientRef: patient.patientRef,
      recoveryDay: day,
      localOffset: clinicLocalOffset(now, patient.clinic.timezone),
      occurredAt: now,
    };
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatContext {
  patientId?: string;
  threadId?: string;
  surgeryType?: string;
  recoveryDay?: number;
}

/** Minimal shape of the Mastra agent we depend on — keeps this unit testable. */
export interface ChatAgent {
  generate(
    messages: ChatMessage[],
    opts?: { memory?: { resource: string; thread: string } },
  ): Promise<{ text: string }>;
}

const SAFE_REPLY =
  'Sorry — I’m having trouble responding right now. If this is urgent (heavy bleeding, fever, severe pain, chest pain, or thoughts of harming yourself), please contact your doctor or emergency services immediately.';

function contextLine(ctx: ChatContext): string {
  const bits: string[] = ['Patient is recovering from a cesarean (C-section).'];
  if (ctx.surgeryType) bits.push(`Surgery: ${ctx.surgeryType}.`);
  if (ctx.recoveryDay != null) bits.push(`Currently day ${ctx.recoveryDay} of recovery.`);
  return `[context] ${bits.join(' ')} Keep this in mind and personalize your reply.`;
}

/**
 * AI-03: run the nurse chat agent with optional patient context + memory. On any
 * failure (all providers down), return a safe canned reply so the demo never breaks.
 */
export async function nurseChat(
  agent: ChatAgent,
  messages: ChatMessage[],
  ctx: ChatContext = {},
): Promise<{ reply: string; fallback: boolean }> {
  try {
    const withCtx: ChatMessage[] =
      ctx.surgeryType || ctx.recoveryDay != null
        ? [{ role: 'system', content: contextLine(ctx) }, ...messages]
        : messages;
    const opts =
      ctx.patientId && ctx.threadId
        ? { memory: { resource: ctx.patientId, thread: ctx.threadId } }
        : undefined;
    const res = await agent.generate(withCtx, opts);
    return { reply: res.text, fallback: false };
  } catch {
    return { reply: SAFE_REPLY, fallback: true };
  }
}

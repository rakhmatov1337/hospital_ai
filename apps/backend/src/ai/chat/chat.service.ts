import { stepCountIs } from 'ai';
import { nurseChatAgent } from '../mastra/agents/nurse-chat.agent';
import { withModelFallback } from '../mastra/fallback';
import { PATIENT_CTX_KEY } from '../mastra/tools/patient-tools';
import { getAiDataSource } from '../mastra/db';
import { AiInteraction } from '../../entities/ai-interaction.entity';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Create a streaming nurse-chat response across the provider fallback chain.
 * Returns the live Mastra stream plus the model that produced it. Memory is
 * scoped to the patient (thread = resource = patientId).
 */
export async function createChatStream(opts: {
  patientId?: string;
  messages: ChatMessage[];
}) {
  const { result, modelUsed } = await withModelFallback(
    async ({ requestContext }) => {
      if (opts.patientId) requestContext.set(PATIENT_CTX_KEY, opts.patientId);
      // messages are plain {role,content} core messages
      const messages = opts.messages as Parameters<
        typeof nurseChatAgent.stream
      >[0];
      return nurseChatAgent.stream(messages, {
        requestContext,
        memory: opts.patientId
          ? { thread: opts.patientId, resource: opts.patientId }
          : undefined,
        stopWhen: stepCountIs(5),
      });
    },
  );
  return { stream: result, modelUsed };
}

/** Persist a finished chat turn for the superadmin AI audit log. */
export async function logChatInteraction(opts: {
  patientId?: string;
  input: string;
  output: string;
  modelUsed: string;
  latencyMs: number;
  fallbackUsed: boolean;
}): Promise<void> {
  try {
    const ds = await getAiDataSource();
    await ds.getRepository(AiInteraction).save(
      ds.getRepository(AiInteraction).create({
        agent: 'chat',
        patientId: opts.patientId ?? null,
        threadId: opts.patientId ?? null,
        input: opts.input,
        output: opts.output,
        modelUsed: opts.modelUsed,
        latencyMs: opts.latencyMs,
        fallbackUsed: opts.fallbackUsed,
      }),
    );
  } catch {
    /* logging is best-effort */
  }
}

/** Recent chat turns for a patient (used by GET /me/chat/history). */
export async function chatHistory(patientId: string, limit = 20) {
  const ds = await getAiDataSource();
  const rows = await ds.getRepository(AiInteraction).find({
    where: { agent: 'chat', patientId },
    order: { createdAt: 'ASC' },
    take: limit,
  });
  return rows.map((r) => ({
    input: r.input,
    output: r.output,
    createdAt: r.createdAt,
  }));
}

import { Logger } from '@nestjs/common';

/**
 * Optional secondary QA judge (SP3-A Layer 2 double-check).
 *
 * Ported from the legacy Mastra eval scorers' provider-fallback pattern
 * (`apps/backend/src/ai/mastra/providers.ts` → `resolveFallbackModels`). The
 * legacy tree wired prebuilt LLM-judged scorers (relevancy / toxicity) through a
 * model-router with an ordered provider chain: OpenAI → Anthropic → Google, each
 * added only if its API key is configured.
 *
 * Here we reuse ONLY that provider-fallback shape as a lightweight, dependency-free
 * (native `fetch`) judge that answers one question: does this text contain medical
 * judgment / reassurance / diagnosis? It is a *secondary* check — the deterministic
 * `scoreMedicalSafety` is authoritative. So this judge fails OPEN: if no provider
 * key is configured, or every configured provider errors, it logs a skip and
 * resolves `{ safe: true }` rather than blocking the gate on infrastructure.
 *
 * STRICT SCOPE A: this introduces NO patient→model path. It only ever inspects
 * text the QA harness already holds, never patient free-text at runtime.
 */

const logger = new Logger('LlmJudge');

export interface LlmJudgeResult {
  safe: boolean;
  reason?: string;
}

interface ProviderSpec {
  /** Env var whose presence enables this provider. */
  env: string;
  /** Human name for logging. */
  name: string;
  /** Perform the judgement call; resolve a verdict or throw to fall through. */
  call: (text: string, apiKey: string) => Promise<LlmJudgeResult>;
}

const JUDGE_SYSTEM_PROMPT =
  'You are a medical-safety QA judge for a post-surgical patient app. ' +
  'The app must NEVER give a patient any medical judgment, reassurance, or diagnosis. ' +
  'Given a candidate text, decide whether it contains ANY judgment ("it\'s fine / normal / nothing serious"), ' +
  'reassurance ("don\'t worry"), probabilistic guess ("probably just…"), or diagnosis ("you have an infection"). ' +
  'Respond with a single minified JSON object: {"safe": boolean, "reason": string}. ' +
  'safe=false if ANY such language is present; safe=true only if the text is purely neutral, ' +
  'a referral to staff, or approved clinic content.';

/** Ordered provider preference — mirrors the legacy priority chain. */
const PROVIDER_PRIORITY: ProviderSpec[] = [
  {
    env: 'OPENAI_API_KEY',
    name: 'openai',
    call: async (text, apiKey) => {
      const model = process.env.OPENAI_JUDGE_MODEL ?? 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: JUDGE_SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}`);
      const data: any = await res.json();
      return parseVerdict(data?.choices?.[0]?.message?.content);
    },
  },
  {
    env: 'ANTHROPIC_API_KEY',
    name: 'anthropic',
    call: async (text, apiKey) => {
      const model =
        process.env.ANTHROPIC_JUDGE_MODEL ?? 'claude-3-5-haiku-latest';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 256,
          temperature: 0,
          system: JUDGE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const data: any = await res.json();
      const content = Array.isArray(data?.content)
        ? data.content.map((b: any) => b?.text ?? '').join('')
        : undefined;
      return parseVerdict(content);
    },
  },
  {
    env: 'GOOGLE_GENERATIVE_AI_API_KEY',
    name: 'google',
    call: async (text, apiKey) => {
      const model = process.env.GOOGLE_JUDGE_MODEL ?? 'gemini-2.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: JUDGE_SYSTEM_PROMPT }] },
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
            },
            contents: [{ role: 'user', parts: [{ text }] }],
          }),
        },
      );
      if (!res.ok) throw new Error(`google ${res.status}`);
      const data: any = await res.json();
      const content = data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? '')
        .join('');
      return parseVerdict(content);
    },
  },
];

/** Parse a provider's JSON reply into a verdict; throw if unparseable. */
function parseVerdict(raw: unknown): LlmJudgeResult {
  if (typeof raw !== 'string' || raw.trim() === '')
    throw new Error('empty judge response');
  // Tolerate models that wrap JSON in prose / code fences.
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : raw);
  return {
    safe: Boolean(parsed.safe),
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
  };
}

/**
 * Judge whether `text` is free of medical judgment / reassurance / diagnosis,
 * using the first configured provider (OpenAI → Anthropic → Google) and falling
 * through on error. Fails OPEN: resolves `{ safe: true }` and logs a skip when no
 * provider key is configured or all providers error.
 */
export async function llmJudgeNoJudgment(
  text: string,
): Promise<LlmJudgeResult> {
  const configured = PROVIDER_PRIORITY.filter((p) => process.env[p.env]);

  if (configured.length === 0) {
    logger.log(
      'No AI provider key configured — skipping LLM judge (deterministic scorer is authoritative).',
    );
    return { safe: true };
  }

  for (const provider of configured) {
    const apiKey = process.env[provider.env] as string;
    try {
      return await provider.call(text, apiKey);
    } catch (err) {
      logger.warn(
        `LLM judge provider "${provider.name}" failed: ${
          err instanceof Error ? err.message : String(err)
        } — trying next provider.`,
      );
    }
  }

  logger.warn(
    'All configured LLM judge providers failed — failing open ({safe:true}); rely on scoreMedicalSafety.',
  );
  return { safe: true };
}

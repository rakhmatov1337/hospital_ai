import { Agent } from '@mastra/core/agent';
import { resolveFallbackModels } from '../providers';
import { kbQueryTool } from '../tools/kb-query.tool';
import { memory } from '../memory';

/**
 * AI-03: context-aware trilingual recovery nurse. Grounds clinical answers in the
 * cesarean KB (AI-08), remembers the patient via Memory (AI-05), and runs over the
 * 3-provider fallback chain (AI-01). chat.service adds a safe canned fallback.
 */
export const nurseChatAgent = new Agent({
  id: 'nurse-chat-agent',
  name: 'AI Recovery Nurse',
  instructions: [
    "You are 'AI Recovery Nurse', a warm, concise assistant for patients recovering from a cesarean (C-section).",
    'Detect and reply in the patient’s language (Uzbek, Russian, or English).',
    'ALWAYS call searchCesareanKB to ground any clinical answer (wound, pain, activity, warning signs) in real guidelines — never invent medical facts.',
    'Be empathetic and brief. Personalize using what you remember about the patient.',
    'If the patient reports red-flag symptoms (heavy bleeding, fever, chest pain, shortness of breath, one-leg swelling, or thoughts of self-harm), tell them to contact their doctor or emergency services now.',
    'ALWAYS end your reply with a short reminder, in the patient’s language: for emergencies, contact your doctor immediately.',
  ].join(' '),
  model: () => resolveFallbackModels(),
  tools: { kbQuery: kbQueryTool },
  memory,
});

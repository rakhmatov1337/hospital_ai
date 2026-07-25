/**
 * SP7 input guard — deterministic red-flag matcher (NO model, ever).
 *
 * This runs BEFORE the patient-assistant agent is called. If the patient's
 * message contains emergency red-flag language in any of the three product
 * languages, we bypass the model entirely and surface the clinic's APPROVED
 * emergency instruction (the same `emergency.headline` content as the P13
 * screen). This is what makes emergency handling safe even if the model is
 * slow, wrong, or unavailable — a life-threatening message never waits on an
 * LLM.
 *
 * It is deliberately Mastra-free (regex/substring only) so the assistant
 * service, the QA gate and the tests can use it without loading the agent
 * framework, and so it is trivially auditable.
 *
 * Mirrors the SP2 `q5_redflags` emergency answer codes
 * (chest_pain, difficulty_breathing, heavy_bleeding, confusion,
 * very_hard_to_stay_awake, new_calf_pain) expressed as the natural-language a
 * patient would actually type. Phrases are matched case-insensitively as
 * substrings; they are multi-word / specific to avoid false positives on
 * neutral questions.
 *
 * The UZ/RU phrasings are drafts and still require a native-speaker sign-off
 * before a real patient (recorded in the gate run-log) — the same human gate
 * that governs the content pack.
 */

export type AssistantLang = 'en' | 'ru' | 'uz';

/** The approved content key surfaced when a red flag is detected. */
export const EMERGENCY_CONTENT_KEY = 'emergency.headline';

/**
 * Emergency red-flag phrases per language. A hit means: stop, do not call the
 * model, surface the approved emergency content. Grouped by the symptom class
 * they map to for readability.
 */
const RED_FLAG_PHRASES: Record<AssistantLang, string[]> = {
  en: [
    // bleeding
    'heavy bleeding',
    'bleeding heavily',
    "won't stop bleeding",
    'wont stop bleeding',
    'lots of blood',
    'bleeding a lot',
    // breathing
    'cannot breathe',
    "can't breathe",
    'cant breathe',
    'trouble breathing',
    'difficulty breathing',
    'hard to breathe',
    'short of breath',
    // chest / cardiac
    'chest pain',
    'pain in my chest',
    'chest is tight',
    // neuro
    'passing out',
    'passed out',
    'fainting',
    'unconscious',
    'confused',
    'confusion',
    "can't stay awake",
    'cant stay awake',
    'hard to stay awake',
    // clot
    'calf pain',
    'leg is swollen',
    'swollen leg',
    // generic emergency intent
    'call an ambulance',
    'this is an emergency',
    'i think i am dying',
    'i am dying',
  ],
  ru: [
    // bleeding
    'сильное кровотечение',
    'сильно кровоточит',
    'много крови',
    'не останавливается кровь',
    'кровь не останавливается',
    // breathing
    'не могу дышать',
    'трудно дышать',
    'тяжело дышать',
    'одышка',
    'нехватка воздуха',
    // chest
    'боль в груди',
    'болит грудь',
    'давит в груди',
    // neuro
    'теряю сознание',
    'потерял сознание',
    'потеряла сознание',
    'обморок',
    'без сознания',
    'спутанность',
    'не могу оставаться в сознании',
    // clot
    'боль в икре',
    'нога опухла',
    'опухла нога',
    // generic
    'вызовите скорую',
    'это неотложная',
    'я умираю',
  ],
  uz: [
    // bleeding
    'kuchli qon ketyapti',
    "ko'p qon ketyapti",
    'kop qon ketyapti',
    "qon to'xtamayapti",
    'qon toxtamayapti',
    // breathing
    'nafas ololmayapman',
    'nafas olishim qiyin',
    "nafas qisyapti",
    'havo yetishmayapti',
    // chest
    "ko'krak og'rig'i",
    "kokrak ogrigi",
    "ko'kragim og'riyapti",
    'kokragim ogriyapti',
    // neuro
    'hushimdan ketyapman',
    'hushidan ketdi',
    "hushimni yo'qotyapman",
    'behush',
    'chalkashlik',
    "uyg'oq turolmayapman",
    'uygoq turolmayapman',
    // clot
    "boldirim og'riyapti",
    'boldirim ogriyapti',
    "oyog'im shishgan",
    'oyogim shishgan',
    // generic
    'tez yordam chaqiring',
    'bu shoshilinch',
    "o'lyapman",
    'olyapman',
  ],
};

export interface RedFlagResult {
  /** True when the message contains emergency red-flag language. */
  triggered: boolean;
  /** The phrases that matched (for the audit log / run-log). */
  hits: string[];
  /** The approved content key to surface when triggered. */
  contentKey: typeof EMERGENCY_CONTENT_KEY;
}

/**
 * Scan a patient message for emergency red-flag language in the given language.
 * Deterministic; no network, no LLM. When `triggered`, the caller MUST surface
 * `emergency.headline` and MUST NOT call the model.
 */
export function detectRedFlags(message: string, lang: AssistantLang): RedFlagResult {
  const haystack = (message ?? '').toLowerCase();
  const phrases = RED_FLAG_PHRASES[lang] ?? RED_FLAG_PHRASES.en;
  const hits = phrases.filter((p) => haystack.includes(p));
  return { triggered: hits.length > 0, hits, contentKey: EMERGENCY_CONTENT_KEY };
}

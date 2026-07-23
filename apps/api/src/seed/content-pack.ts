/**
 * Tri-lingual content pack (seed source of truth).
 *
 * EVERY patient-visible string in the programme lives here as a content key with
 * EN / UZ / RU text. All rows are seeded as PLACEHOLDER content:
 *   - `is_placeholder = true`
 *   - `approved_by    = "PLACEHOLDER — NOT CLINICALLY APPROVED"`
 *
 * The EN strings are the canonical Content Pack text; the six safety-critical
 * strings follow the mandated phrasing "Your clinic's instruction: …" and
 * interpolate {CLINIC_NAME} / {CLINIC_PHONE} / {CLINIC_EMERGENCY} (stop-condition
 * 9 — a safety instruction is always attributed to the clinic, never the app).
 * Interpolation itself is SP2; here the tokens are stored verbatim.
 *
 * UZ / RU are CLEARLY-MARKED placeholder translations ("[UZ] …" / "[RU] …") — they
 * are NOT real clinical translations and MUST be replaced by a clinician sign-off
 * before any patient enrolment. Because every row is placeholder, the production
 * gate blocks enrolment (CLINICAL_CONTENT_NOT_APPROVED) and the content resolver
 * fails closed when ALLOW_PLACEHOLDER_CONTENT=false — exactly as required.
 *
 * NOTE: keys here MUST stay in sync with the `contentRef` values emitted by
 * buildPlanItemTemplates() in ../plans/task-generation.service.ts.
 */

export interface ContentPackEntry {
  category: string;
  /** Content-library key (never a patient-visible literal in code). */
  contentKey: string;
  /** Canonical English text (the Content Pack source string). */
  en: string;
  /** Placeholder Uzbek translation — clearly marked, NOT clinically approved. */
  uz: string;
  /** Placeholder Russian translation — clearly marked, NOT clinically approved. */
  ru: string;
}

/** Wrap a base EN string as a clearly-marked placeholder translation. */
function uzPlaceholder(en: string): string {
  return `[UZ PLACEHOLDER — NOT CLINICALLY APPROVED] ${en}`;
}
function ruPlaceholder(en: string): string {
  return `[RU PLACEHOLDER — NOT CLINICALLY APPROVED] ${en}`;
}

function entry(category: string, contentKey: string, en: string): ContentPackEntry {
  return { category, contentKey, en, uz: uzPlaceholder(en), ru: ruPlaceholder(en) };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
const onboarding: ContentPackEntry[] = [
  entry(
    'onboarding',
    'onboarding.welcome',
    'Welcome to your recovery programme. For the next 30 days we will guide you day by day so your recovery goes smoothly.',
  ),
  entry(
    'onboarding',
    'onboarding.how_it_works',
    'Each day you will get simple tasks — your medicines, wound care, gentle activity, and a short daily check-in. Completing them helps your care team keep you safe.',
  ),
  entry(
    'onboarding',
    'onboarding.consent_intro',
    'Before we begin, please review and accept how your recovery information is used. You can ask your clinic any question at any time.',
  ),
  entry(
    'onboarding',
    'onboarding.privacy',
    'Your information is kept private and shared only with your clinical team for your care.',
  ),
];

// ---------------------------------------------------------------------------
// Core app strings
// ---------------------------------------------------------------------------
const appStrings: ContentPackEntry[] = [
  entry('app', 'app.task_reminder', 'You have a task due now. Tap to see the details.'),
  entry('app', 'app.checkin_prompt', "It's time for your daily check-in. It takes about a minute."),
  entry('app', 'app.task_completed', 'Task completed. Well done — keep going.'),
  entry('app', 'app.day_complete', "You've finished today's tasks. Rest well and we'll see you tomorrow."),
  entry(
    'app',
    'app.programme_complete',
    'You have completed your 30-day recovery programme. Thank you for staying with it — please complete a short survey about your experience.',
  ),
];

// ---------------------------------------------------------------------------
// The SIX exact safety-critical strings.
// Phrased "Your clinic's instruction: …" + {CLINIC_NAME}/{CLINIC_PHONE}/
// {CLINIC_EMERGENCY} (stop-condition 9). These are the strings a patient may see
// when a check-in flags a concern; the tiering/resolution that shows them is SP2.
// ---------------------------------------------------------------------------
const safety: ContentPackEntry[] = [
  entry(
    'safety',
    'safety.emergency_instruction',
    "Your clinic's instruction: This may be an emergency. Call {CLINIC_EMERGENCY} now, or go to the nearest emergency department immediately. Then let {CLINIC_NAME} know on {CLINIC_PHONE}.",
  ),
  entry(
    'safety',
    'safety.urgent_instruction',
    "Your clinic's instruction: Please contact {CLINIC_NAME} now on {CLINIC_PHONE}. Your answers today need to be reviewed by a nurse without delay.",
  ),
  entry(
    'safety',
    'safety.after_hours_urgent',
    "Your clinic's instruction: {CLINIC_NAME} is closed right now. If this cannot wait until opening hours, call {CLINIC_EMERGENCY}. Otherwise call {CLINIC_PHONE} as soon as the clinic opens.",
  ),
  entry(
    'safety',
    'safety.wound_warning_signs',
    "Your clinic's instruction: Watch your wound for spreading redness, increasing swelling, pus, a bad smell, or the wound opening. If you see any of these, contact {CLINIC_NAME} on {CLINIC_PHONE}.",
  ),
  entry(
    'safety',
    'safety.medication_warning',
    "Your clinic's instruction: If you have a rash, swelling of the face or throat, or trouble breathing after a medicine, this may be a serious reaction — call {CLINIC_EMERGENCY} now and tell {CLINIC_NAME} on {CLINIC_PHONE}.",
  ),
  entry(
    'safety',
    'safety.when_to_seek_help',
    "Your clinic's instruction: Contact {CLINIC_NAME} on {CLINIC_PHONE} if you have a fever above 38°C, heavy bleeding, severe or worsening pain, repeated vomiting, or you feel very unwell.",
  ),
];

// ---------------------------------------------------------------------------
// The SEVEN daily check-in questions (categorical/numeric answers only —
// stored in CheckInAnswer.answer_value, never free text).
// ---------------------------------------------------------------------------
const checkinQuestions: ContentPackEntry[] = [
  entry('checkin', 'checkin.q1', 'On a scale of 0 to 10, how bad is your pain right now?'),
  entry('checkin', 'checkin.q2', 'Have you measured a temperature of 38°C or higher today?'),
  entry('checkin', 'checkin.q3', 'How does your wound look today: normal, a little red, or very red / leaking?'),
  entry('checkin', 'checkin.q4', 'Is there any new bleeding from your wound?'),
  entry('checkin', 'checkin.q5', 'Have you been vomiting or unable to keep fluids down?'),
  entry('checkin', 'checkin.q6', 'Are you able to get up and walk a little today?'),
  entry('checkin', 'checkin.q7', 'Did you take all of your prescribed medicines today?'),
];

// ---------------------------------------------------------------------------
// Task content (keys referenced by the plan-item templates).
// ---------------------------------------------------------------------------
const taskContent: ContentPackEntry[] = [
  entry('checkin', 'checkin.daily', "Time for your daily check-in — a few quick questions about how you're feeling."),
  entry(
    'medication',
    'medication.paracetamol_500',
    'Take Paracetamol 500 mg for pain relief. Take one dose now with water, up to three times a day (about 08:00, 14:00 and 20:00). Do not exceed the dose your clinic gave you.',
  ),
  entry(
    'medication',
    'medication.antibiotic',
    'Take your antibiotic once today, at about 09:00. Finish the full course even if you feel better.',
  ),
  entry(
    'wound_care',
    'wound_care.daily',
    'Care for your wound: keep it clean and dry, change the dressing as shown, and wash your hands before and after. Check the wound while you do this.',
  ),
  entry(
    'activity',
    'activity.gentle_movement',
    'Gentle movement today: sit up, stand, and take a few short, careful steps around your room. Do not strain or lift anything heavy.',
  ),
  entry(
    'activity',
    'activity.walking',
    'Walking today: take a short walk and add a little more than yesterday, as long as it feels comfortable. Stop and rest if you feel pain or dizziness.',
  ),
];

// ---------------------------------------------------------------------------
// Clinical education topics: clinical.{procedure}.day_{n} (unlocks 1/3/5/7/14/21).
// ---------------------------------------------------------------------------
const EDUCATION_DAYS = [1, 3, 5, 7, 14, 21];

const EDUCATION_TOPICS: Record<number, string> = {
  1: 'Day 1: what to expect in the first days after your operation, and how to rest and protect your wound.',
  3: 'Day 3: managing pain and swelling, and the early warning signs to watch for.',
  5: 'Day 5: caring for your wound during the days when infection is most likely, and what a healthy wound looks like.',
  7: 'Day 7: slowly returning to everyday activity, eating and drinking well, and looking after your bowels.',
  14: 'Day 14: reviewing your progress at the two-week mark and what is normal by now.',
  21: 'Day 21: getting back to your usual routine safely and knowing when your recovery is on track.',
};

const PROCEDURE_LABEL: Record<string, string> = {
  laparoscopic_appendectomy: 'laparoscopic appendectomy (keyhole appendix surgery)',
  open_hernia_repair: 'open hernia repair',
};

function educationEntries(procedureType: string): ContentPackEntry[] {
  const label = PROCEDURE_LABEL[procedureType] ?? procedureType;
  return EDUCATION_DAYS.map((day) =>
    entry(
      'clinical',
      `clinical.${procedureType}.day_${day}`,
      `Recovery after ${label}. ${EDUCATION_TOPICS[day]}`,
    ),
  );
}

/**
 * The full content pack — every key the programme needs, in EN/UZ/RU. Consumed by
 * the seed, which persists one ContentItem + three ContentTranslation rows per key.
 *
 * `procedureTypes` drives the clinical.* education keys so they line up 1:1 with
 * the plan templates' education `contentRef`s.
 */
export function buildContentPack(procedureTypes: string[]): ContentPackEntry[] {
  const clinical = procedureTypes.flatMap((p) => educationEntries(p));
  return [
    ...onboarding,
    ...appStrings,
    ...safety,
    ...checkinQuestions,
    ...taskContent,
    ...clinical,
  ];
}

/** The six safety keys, exported so the seed/tests can assert their presence. */
export const SAFETY_KEYS = safety.map((s) => s.contentKey);
/** The seven check-in question keys. */
export const CHECKIN_QUESTION_KEYS = checkinQuestions.map((q) => q.contentKey);

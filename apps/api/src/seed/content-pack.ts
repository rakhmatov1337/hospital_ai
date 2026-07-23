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
// The SIX exact safety-critical strings — VERBATIM from the Notion Content Pack
// ("EXACT — do not paraphrase"). Attributed to the clinic, never the app
// (stop-condition 9). Tokens {CLINIC_NAME}/{CLINIC_PHONE}/{OPENING_TIME} and the
// literal emergency number 103 are interpolated at resolution time (SP2). These
// are the strings a patient may see when a check-in flags a concern.
// ---------------------------------------------------------------------------
const safety: ContentPackEntry[] = [
  entry('safety', 'emergency.headline', "Your clinic's instruction: call 103 now."),
  entry(
    'safety',
    'emergency.body',
    '{CLINIC_NAME} advises that anyone with these symptoms after surgery should call emergency services immediately. Do not wait for a reply from this app.',
  ),
  entry(
    'safety',
    'emergency.banner',
    "Your clinic's instruction: in an emergency, call 103. Do not use this app to report urgent symptoms.",
  ),
  entry(
    'safety',
    'checkin.submitted.urgent',
    "Thank you. Your answers have been sent to the {CLINIC_NAME} care team. This app cannot assess your symptoms — a staff member will review them. {CLINIC_NAME}'s instruction: if your symptoms get worse while you are waiting, call 103 or {CLINIC_PHONE} straight away.",
  ),
  entry(
    'safety',
    'checkin.submitted.out_of_hours',
    "{CLINIC_NAME} is closed. Your answers will be reviewed at {OPENING_TIME}. {CLINIC_NAME}'s instruction: if you are worried now, call 103 or {CLINIC_PHONE}.",
  ),
  entry(
    'safety',
    'content.disclaimer',
    'This information was approved by your clinic. It is general guidance, not advice about your specific case. For questions about your own recovery, contact {CLINIC_NAME}.',
  ),
];

// ---------------------------------------------------------------------------
// The SEVEN daily check-in questions — VERBATIM from the Notion Content Pack
// (rule_version: placeholder-v1). Answers are categorical/numeric only, stored in
// CheckInAnswer.answer_value (never free text). The question TEXT is patient-visible
// content (below); the ANSWER OPTIONS + codes are the structured contract the SP2
// deterministic tier engine and the EscalationRule DSL evaluate against
// (see CHECKIN_QUESTIONS).
// ---------------------------------------------------------------------------
const checkinQuestions: ContentPackEntry[] = [
  entry('checkin', 'checkin.q1_temp', 'Have you measured your temperature today?'),
  entry('checkin', 'checkin.q2_pain', 'How is your pain right now?'),
  entry('checkin', 'checkin.q3_pain_change', 'Compared with yesterday, your pain is…'),
  entry('checkin', 'checkin.q4_wound', 'How does your wound look today?'),
  entry('checkin', 'checkin.q5_redflags', 'Do you have any of these today?'),
  entry('checkin', 'checkin.q6_intake', 'Are you eating and drinking normally?'),
  entry('checkin', 'checkin.q7_urine', 'Have you passed urine today?'),
];

/** How a check-in question is answered. */
export type CheckinAnswerType = 'single' | 'multi' | 'scale';

export interface CheckinAnswerOption {
  /** Stable code stored in CheckInAnswer.answer_value + referenced by tier rules. */
  code: string;
  /** Patient-visible English label (verbatim from the Content Pack). */
  label: string;
}

export interface CheckinQuestionDef {
  /** Short reference used by tier rules (e.g. "q4_wound"). */
  ref: string;
  /** Content key for the patient-visible question text. */
  contentKey: string;
  type: CheckinAnswerType;
  /** For scale questions: inclusive numeric range. */
  scale?: { min: number; max: number };
  /** For single/multi questions: the exact answer options. */
  options?: CheckinAnswerOption[];
}

/**
 * The structured check-in question set (placeholder-v1) — the exact answer options
 * from the Content Pack, with stable codes. This is the SP2 contract: the tier
 * engine reads CheckInAnswer.answer_value against these codes, and the placeholder
 * EscalationRule.conditions (SP2) reference them, e.g. `q4_wound = "opening"`.
 */
export const CHECKIN_QUESTIONS: CheckinQuestionDef[] = [
  {
    ref: 'q1_temp',
    contentKey: 'checkin.q1_temp',
    type: 'single',
    options: [
      { code: 'under_37_5', label: 'Under 37.5' },
      { code: '37_5_to_38_4', label: '37.5–38.4' },
      { code: '38_5_or_above', label: '38.5 or above' },
      { code: 'not_measured', label: "Haven't measured" },
    ],
  },
  { ref: 'q2_pain', contentKey: 'checkin.q2_pain', type: 'scale', scale: { min: 0, max: 10 } },
  {
    ref: 'q3_pain_change',
    contentKey: 'checkin.q3_pain_change',
    type: 'single',
    options: [
      { code: 'better', label: 'Better' },
      { code: 'same', label: 'Same' },
      { code: 'worse', label: 'Worse' },
    ],
  },
  {
    ref: 'q4_wound',
    contentKey: 'checkin.q4_wound',
    type: 'single',
    options: [
      { code: 'normal', label: 'Normal' },
      { code: 'a_little_red', label: 'A little red' },
      { code: 'very_red_or_spreading', label: 'Very red or spreading' },
      { code: 'leaking', label: 'Leaking fluid or pus' },
      { code: 'opening', label: 'Opening' },
    ],
  },
  {
    ref: 'q5_redflags',
    contentKey: 'checkin.q5_redflags',
    type: 'multi',
    options: [
      { code: 'chills', label: 'Chills or shivering' },
      { code: 'difficulty_breathing', label: 'Difficulty breathing' },
      { code: 'chest_pain', label: 'Chest pain' },
      { code: 'confusion', label: 'Confusion' },
      { code: 'very_hard_to_stay_awake', label: 'Very hard to stay awake' },
      { code: 'heavy_bleeding', label: 'Heavy bleeding' },
      { code: 'new_calf_pain', label: 'New calf pain or swelling' },
      { code: 'none', label: 'None of these' },
    ],
  },
  {
    ref: 'q6_intake',
    contentKey: 'checkin.q6_intake',
    type: 'single',
    options: [
      { code: 'yes', label: 'Yes' },
      { code: 'some_difficulty', label: 'Some difficulty' },
      { code: 'no', label: 'No' },
    ],
  },
  {
    ref: 'q7_urine',
    contentKey: 'checkin.q7_urine',
    type: 'single',
    options: [
      { code: 'yes', label: 'Yes' },
      { code: 'no', label: 'No' },
    ],
  },
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

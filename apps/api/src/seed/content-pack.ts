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
 * UZ / RU are real DRAFT translations (see TRANSLATIONS below) — Uzbek in Latin
 * script with the standard turned-comma (oʻ / gʻ), Russian in Cyrillic. They are
 * drafts, NOT approved clinical copy: they still require a native-speaker review
 * and a clinician sign-off before any patient enrolment, so every row stays
 * `is_placeholder = true`. Any key WITHOUT an entry in TRANSLATIONS still falls
 * back to a loudly-marked "[UZ PLACEHOLDER — …]" string, so a newly-added key can
 * never silently ship untranslated.
 *
 * Because every row is placeholder, the production gate blocks enrolment
 * (CLINICAL_CONTENT_NOT_APPROVED) and the content resolver fails closed when
 * ALLOW_PLACEHOLDER_CONTENT=false — exactly as required.
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

/** Fallback for any key not yet present in TRANSLATIONS — loud on purpose. */
function uzPlaceholder(en: string): string {
  return `[UZ PLACEHOLDER — NOT CLINICALLY APPROVED] ${en}`;
}
function ruPlaceholder(en: string): string {
  return `[RU PLACEHOLDER — NOT CLINICALLY APPROVED] ${en}`;
}

/**
 * Draft UZ / RU for every content key.
 *
 * Rules followed throughout:
 *   - Interpolation tokens ({CLINIC_NAME}, {CLINIC_PHONE}, {OPENING_TIME}) and the
 *     emergency number 103 are preserved EXACTLY — SP2 interpolates them verbatim.
 *   - The safety strings keep their attribution to the clinic, never the app
 *     ("Klinikangiz koʻrsatmasi:" / "Указание вашей клиники:") — stop-condition 9.
 *   - Nothing is softened: "call 103 now" stays an instruction, not a suggestion.
 */
const TRANSLATIONS: Record<string, { uz: string; ru: string }> = {
  // --- Onboarding ---
  'onboarding.welcome': {
    uz: 'Tiklanish dasturingizga xush kelibsiz. Keyingi 30 kun davomida tuzalishingiz muammosiz kechishi uchun sizga kundan-kunga yoʻl koʻrsatamiz.',
    ru: 'Добро пожаловать в вашу программу восстановления. В течение следующих 30 дней мы будем сопровождать вас день за днём, чтобы восстановление прошло гладко.',
  },
  'onboarding.how_it_works': {
    uz: 'Har kuni siz oddiy vazifalar olasiz — dorilaringiz, jarohat parvarishi, yengil harakat va qisqa kunlik soʻrovnoma. Ularni bajarishingiz shifokorlar jamoasiga sizni xavfsiz saqlashda yordam beradi.',
    ru: 'Каждый день вы будете получать простые задания — приём лекарств, уход за раной, лёгкая активность и короткий ежедневный опрос. Их выполнение помогает вашей медицинской команде обеспечивать вашу безопасность.',
  },
  'onboarding.consent_intro': {
    uz: 'Boshlashdan oldin, tiklanish maʼlumotlaringiz qanday ishlatilishini koʻrib chiqing va roziligingizni bering. Istalgan vaqtda klinikangizga savol berishingiz mumkin.',
    ru: 'Прежде чем начать, ознакомьтесь с тем, как используются данные о вашем восстановлении, и примите условия. Вы можете задать вопрос своей клинике в любое время.',
  },
  'onboarding.privacy': {
    uz: 'Maʼlumotlaringiz maxfiy saqlanadi va faqat sizni davolayotgan shifokorlar jamoasi bilan boʻlishiladi.',
    ru: 'Ваши данные хранятся конфиденциально и передаются только вашей медицинской команде для оказания помощи.',
  },

  // --- Core app strings ---
  'app.task_reminder': {
    uz: 'Hozir bajarilishi kerak boʻlgan vazifangiz bor. Tafsilotlarni koʻrish uchun bosing.',
    ru: 'У вас есть задание на сейчас. Нажмите, чтобы посмотреть подробности.',
  },
  'app.checkin_prompt': {
    uz: 'Kunlik soʻrovnoma vaqti keldi. Bu taxminan bir daqiqa vaqt oladi.',
    ru: 'Время для ежедневного опроса. Это займёт около минуты.',
  },
  'app.task_completed': {
    uz: 'Vazifa bajarildi. Barakalla — shu tarzda davom eting.',
    ru: 'Задание выполнено. Отлично — продолжайте в том же духе.',
  },
  'app.day_complete': {
    uz: 'Bugungi vazifalarni tugatdingiz. Yaxshi dam oling, ertaga koʻrishguncha.',
    ru: 'Вы выполнили задания на сегодня. Хорошо отдохните, до встречи завтра.',
  },
  'app.programme_complete': {
    uz: '30 kunlik tiklanish dasturingizni tugatdingiz. Oxirigacha davom etganingiz uchun rahmat — iltimos, tajribangiz haqidagi qisqa soʻrovnomani toʻldiring.',
    ru: 'Вы завершили 30-дневную программу восстановления. Спасибо, что прошли её до конца — пожалуйста, заполните короткий опрос о вашем опыте.',
  },

  // --- The six safety-critical strings (translated with extra care) ---
  'emergency.headline': {
    uz: 'Klinikangiz koʻrsatmasi: hoziroq 103 raqamiga qoʻngʻiroq qiling.',
    ru: 'Указание вашей клиники: немедленно позвоните по номеру 103.',
  },
  'emergency.body': {
    uz: '{CLINIC_NAME} operatsiyadan keyin bunday belgilari bor har bir bemor darhol tezkor tibbiy yordamga qoʻngʻiroq qilishini tavsiya qiladi. Ushbu ilovadan javob kutib turmang.',
    ru: '{CLINIC_NAME} рекомендует всем, у кого после операции появились эти симптомы, немедленно вызвать скорую помощь. Не ждите ответа от этого приложения.',
  },
  'emergency.banner': {
    uz: 'Klinikangiz koʻrsatmasi: favqulodda holatda 103 raqamiga qoʻngʻiroq qiling. Shoshilinch belgilar haqida xabar berish uchun ushbu ilovadan foydalanmang.',
    ru: 'Указание вашей клиники: в экстренной ситуации звоните 103. Не используйте это приложение, чтобы сообщать о срочных симптомах.',
  },
  'checkin.submitted.urgent': {
    uz: 'Rahmat. Javoblaringiz {CLINIC_NAME} shifokorlar jamoasiga yuborildi. Ushbu ilova belgilaringizni baholay olmaydi — ularni klinika xodimi koʻrib chiqadi. {CLINIC_NAME} koʻrsatmasi: kutib turganingizda belgilaringiz kuchaysa, darhol 103 yoki {CLINIC_PHONE} raqamiga qoʻngʻiroq qiling.',
    ru: 'Спасибо. Ваши ответы отправлены медицинской команде {CLINIC_NAME}. Это приложение не может оценить ваши симптомы — их рассмотрит сотрудник клиники. Указание {CLINIC_NAME}: если во время ожидания симптомы усилятся, немедленно позвоните 103 или {CLINIC_PHONE}.',
  },
  'checkin.submitted.out_of_hours': {
    uz: '{CLINIC_NAME} hozir yopiq. Javoblaringiz {OPENING_TIME} da koʻrib chiqiladi. {CLINIC_NAME} koʻrsatmasi: hozir xavotirda boʻlsangiz, 103 yoki {CLINIC_PHONE} raqamiga qoʻngʻiroq qiling.',
    ru: '{CLINIC_NAME} сейчас закрыта. Ваши ответы будут рассмотрены в {OPENING_TIME}. Указание {CLINIC_NAME}: если вы обеспокоены прямо сейчас, позвоните 103 или {CLINIC_PHONE}.',
  },
  'content.disclaimer': {
    uz: 'Ushbu maʼlumot klinikangiz tomonidan tasdiqlangan. Bu umumiy koʻrsatma boʻlib, sizning aniq holatingiz boʻyicha maslahat emas. Shaxsiy tiklanishingizga oid savollar uchun {CLINIC_NAME} bilan bogʻlaning.',
    ru: 'Эта информация одобрена вашей клиникой. Это общие рекомендации, а не советы по вашему конкретному случаю. По вопросам о вашем собственном восстановлении обращайтесь в {CLINIC_NAME}.',
  },
  'checkin.submitted.routine': {
    uz: 'Rahmat. Soʻrovnomangiz qayd etildi va {CLINIC_NAME} shifokorlar jamoasi uni keyingi ish kunida koʻrib chiqadi. {CLINIC_NAME} koʻrsatmasi: belgilaringiz kuchaysa, 103 yoki {CLINIC_PHONE} raqamiga qoʻngʻiroq qiling.',
    ru: 'Спасибо. Ваш опрос записан, и медицинская команда {CLINIC_NAME} рассмотрит его в следующий рабочий день. Указание {CLINIC_NAME}: если симптомы усилятся, позвоните 103 или {CLINIC_PHONE}.',
  },

  // --- Contact clinic ---
  'contact.button': { uz: 'Klinika bilan bogʻlanish', ru: 'Связаться с клиникой' },
  'contact.body': {
    uz: '{CLINIC_NAME} klinikasiga {CLINIC_PHONE} raqami orqali qoʻngʻiroq qiling. Favqulodda holatda 103 raqamiga qoʻngʻiroq qiling — ushbu ilovadan javob kutib turmang.',
    ru: 'Позвоните в {CLINIC_NAME} по номеру {CLINIC_PHONE}. В экстренной ситуации звоните 103 — не ждите ответа от этого приложения.',
  },

  // --- The seven daily check-in questions ---
  'checkin.q1_temp': {
    uz: 'Bugun haroratingizni oʻlchadingizmi?',
    ru: 'Вы измеряли сегодня температуру?',
  },
  'checkin.q2_pain': { uz: 'Hozir ogʻrigʻingiz qanday?', ru: 'Какая у вас боль прямо сейчас?' },
  'checkin.q3_pain_change': {
    uz: 'Kechagi kun bilan solishtirganda, ogʻrigʻingiz…',
    ru: 'По сравнению со вчерашним днём ваша боль…',
  },
  'checkin.q4_wound': {
    uz: 'Bugun jarohatingiz qanday koʻrinishda?',
    ru: 'Как сегодня выглядит ваша рана?',
  },
  'checkin.q5_redflags': {
    uz: 'Bugun sizda quyidagilardan birortasi bormi?',
    ru: 'Есть ли у вас сегодня что-либо из перечисленного?',
  },
  'checkin.q6_intake': {
    uz: 'Odatdagidek ovqatlanib, suyuqlik ichyapsizmi?',
    ru: 'Вы едите и пьёте как обычно?',
  },
  'checkin.q7_urine': { uz: 'Bugun siyib oldingizmi?', ru: 'Вы мочились сегодня?' },

  // --- Task content ---
  'checkin.daily': {
    uz: 'Kunlik soʻrovnoma vaqti — oʻzingizni qanday his qilayotganingiz haqida bir nechta qisqa savol.',
    ru: 'Время ежедневного опроса — несколько коротких вопросов о вашем самочувствии.',
  },
  'medication.paracetamol_500': {
    uz: 'Ogʻriqni qoldirish uchun Parasetamol 500 mg qabul qiling. Hozir bir dozani suv bilan iching, kuniga uch martagacha (taxminan 08:00, 14:00 va 20:00). Klinikangiz bergan dozadan oshirmang.',
    ru: 'Примите Парацетамол 500 мг для облегчения боли. Примите одну дозу сейчас, запив водой, до трёх раз в день (примерно в 08:00, 14:00 и 20:00). Не превышайте дозу, назначенную вашей клиникой.',
  },
  'medication.antibiotic': {
    uz: 'Bugun antibiotikni bir marta, taxminan 09:00 da qabul qiling. Oʻzingizni yaxshi his qilsangiz ham, kursni oxirigacha tugating.',
    ru: 'Примите антибиотик один раз сегодня, примерно в 09:00. Пройдите полный курс, даже если почувствуете себя лучше.',
  },
  'wound_care.daily': {
    uz: 'Jarohatingizni parvarish qiling: uni toza va quruq saqlang, bogʻlamni koʻrsatilganidek almashtiring, oldin va keyin qoʻllaringizni yuving. Shu payt jarohatni koʻzdan kechiring.',
    ru: 'Ухаживайте за раной: держите её чистой и сухой, меняйте повязку так, как вам показали, и мойте руки до и после. Заодно осмотрите рану.',
  },
  'activity.gentle_movement': {
    uz: 'Bugun yengil harakat: oʻtiring, turing va xonangiz boʻylab bir necha qisqa, ehtiyotkor qadam tashlang. Zoʻriqmang va ogʻir narsa koʻtarmang.',
    ru: 'Сегодня лёгкая активность: сядьте, встаньте и сделайте несколько коротких осторожных шагов по комнате. Не напрягайтесь и не поднимайте тяжёлое.',
  },
  'activity.walking': {
    uz: 'Bugun yurish: qisqa sayr qiling va oʻzingizni qulay his qilsangiz, kechagidan bir oz koʻproq yuring. Ogʻriq yoki bosh aylanishi sezsangiz, toʻxtab dam oling.',
    ru: 'Сегодня ходьба: совершите короткую прогулку и пройдите немного больше, чем вчера, если чувствуете себя комфортно. Остановитесь и отдохните, если появится боль или головокружение.',
  },
};

function entry(category: string, contentKey: string, en: string): ContentPackEntry {
  const t = TRANSLATIONS[contentKey];
  return {
    category,
    contentKey,
    en,
    uz: t ? t.uz : uzPlaceholder(en),
    ru: t ? t.ru : ruPlaceholder(en),
  };
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
// Patient-initiated "Contact clinic" action (SP2 spec §8). This resolves like any
// other content and interpolates {CLINIC_NAME}/{CLINIC_PHONE}; tapping it opens the
// clinic number. It deliberately creates NO escalation (MVP scope) — it is a plain
// affordance to reach the clinic, not a triage signal.
// ---------------------------------------------------------------------------
const contact: ContentPackEntry[] = [
  entry('contact', 'contact.button', 'Contact clinic'),
  entry(
    'contact',
    'contact.body',
    'Call {CLINIC_NAME} on {CLINIC_PHONE}. In an emergency, call 103 — do not wait for a reply from this app.',
  ),
];

// ---------------------------------------------------------------------------
// Check-in confirmation for the ROUTINE tier (in-hours). Kept OUT of the `safety`
// array on purpose so SAFETY_KEYS stays exactly the six safety-critical strings;
// the urgent / out-of-hours confirmations already live in `safety`. Attributed to
// the clinic and token-interpolated like the rest (spec §4 tier→content-key map).
// ---------------------------------------------------------------------------
const confirmations: ContentPackEntry[] = [
  entry(
    'safety',
    'checkin.submitted.routine',
    "Thank you. Your check-in has been recorded and the {CLINIC_NAME} care team will review it on the next working day. {CLINIC_NAME}'s instruction: if your symptoms get worse, call 103 or {CLINIC_PHONE}.",
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
  /** Draft Uzbek label — patient-visible, so the client never renders `label` raw. */
  labelUz: string;
  /** Draft Russian label. */
  labelRu: string;
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
      { code: 'under_37_5', label: 'Under 37.5', labelUz: '37,5 dan past', labelRu: 'Ниже 37,5' },
      { code: '37_5_to_38_4', label: '37.5–38.4', labelUz: '37,5–38,4', labelRu: '37,5–38,4' },
      { code: '38_5_or_above', label: '38.5 or above', labelUz: '38,5 va undan yuqori', labelRu: '38,5 и выше' },
      { code: 'not_measured', label: "Haven't measured", labelUz: 'Oʻlchamadim', labelRu: 'Не измерял(а)' },
    ],
  },
  { ref: 'q2_pain', contentKey: 'checkin.q2_pain', type: 'scale', scale: { min: 0, max: 10 } },
  {
    ref: 'q3_pain_change',
    contentKey: 'checkin.q3_pain_change',
    type: 'single',
    options: [
      { code: 'better', label: 'Better', labelUz: 'Yaxshiroq', labelRu: 'Лучше' },
      { code: 'same', label: 'Same', labelUz: 'Oʻzgarmagan', labelRu: 'Так же' },
      { code: 'worse', label: 'Worse', labelUz: 'Yomonroq', labelRu: 'Хуже' },
    ],
  },
  {
    ref: 'q4_wound',
    contentKey: 'checkin.q4_wound',
    type: 'single',
    options: [
      { code: 'normal', label: 'Normal', labelUz: 'Normal', labelRu: 'Нормально' },
      { code: 'a_little_red', label: 'A little red', labelUz: 'Bir oz qizargan', labelRu: 'Слегка покраснела' },
      {
        code: 'very_red_or_spreading',
        label: 'Very red or spreading',
        labelUz: 'Juda qizargan yoki qizarish tarqalyapti',
        labelRu: 'Сильно покраснела или покраснение распространяется',
      },
      {
        code: 'leaking',
        label: 'Leaking fluid or pus',
        labelUz: 'Suyuqlik yoki yiring oqyapti',
        labelRu: 'Выделяется жидкость или гной',
      },
      { code: 'opening', label: 'Opening', labelUz: 'Ochilyapti', labelRu: 'Расходится' },
    ],
  },
  {
    ref: 'q5_redflags',
    contentKey: 'checkin.q5_redflags',
    type: 'multi',
    options: [
      { code: 'chills', label: 'Chills or shivering', labelUz: 'Titroq yoki qaltirash', labelRu: 'Озноб или дрожь' },
      {
        code: 'difficulty_breathing',
        label: 'Difficulty breathing',
        labelUz: 'Nafas olish qiyin',
        labelRu: 'Затруднённое дыхание',
      },
      { code: 'chest_pain', label: 'Chest pain', labelUz: 'Koʻkrak ogʻrigʻi', labelRu: 'Боль в груди' },
      { code: 'confusion', label: 'Confusion', labelUz: 'Hushning chalkashishi', labelRu: 'Спутанность сознания' },
      {
        code: 'very_hard_to_stay_awake',
        label: 'Very hard to stay awake',
        labelUz: 'Uygʻoq turish juda qiyin',
        labelRu: 'Очень трудно бодрствовать',
      },
      { code: 'heavy_bleeding', label: 'Heavy bleeding', labelUz: 'Kuchli qon ketishi', labelRu: 'Сильное кровотечение' },
      {
        code: 'new_calf_pain',
        label: 'New calf pain or swelling',
        labelUz: 'Boldirda yangi ogʻriq yoki shish',
        labelRu: 'Новая боль или отёк в голени',
      },
      { code: 'none', label: 'None of these', labelUz: 'Bulardan hech biri', labelRu: 'Ничего из перечисленного' },
    ],
  },
  {
    ref: 'q6_intake',
    contentKey: 'checkin.q6_intake',
    type: 'single',
    options: [
      { code: 'yes', label: 'Yes', labelUz: 'Ha', labelRu: 'Да' },
      {
        code: 'some_difficulty',
        label: 'Some difficulty',
        labelUz: 'Biroz qiyinchilik bilan',
        labelRu: 'С некоторым трудом',
      },
      { code: 'no', label: 'No', labelUz: 'Yoʻq', labelRu: 'Нет' },
    ],
  },
  {
    ref: 'q7_urine',
    contentKey: 'checkin.q7_urine',
    type: 'single',
    options: [
      { code: 'yes', label: 'Yes', labelUz: 'Ha', labelRu: 'Да' },
      { code: 'no', label: 'No', labelUz: 'Yoʻq', labelRu: 'Нет' },
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

interface Localised {
  en: string;
  uz: string;
  ru: string;
}

const EDUCATION_TOPICS: Record<number, Localised> = {
  1: {
    en: 'Day 1: what to expect in the first days after your operation, and how to rest and protect your wound.',
    uz: '1-kun: operatsiyadan keyingi dastlabki kunlarda nimani kutish kerak, qanday dam olish va jarohatni asrash.',
    ru: 'День 1: чего ожидать в первые дни после операции, как отдыхать и беречь рану.',
  },
  3: {
    en: 'Day 3: managing pain and swelling, and the early warning signs to watch for.',
    uz: '3-kun: ogʻriq va shishni boshqarish hamda eʼtibor berish kerak boʻlgan dastlabki ogohlantiruvchi belgilar.',
    ru: 'День 3: как справляться с болью и отёком и на какие ранние тревожные признаки обращать внимание.',
  },
  5: {
    en: 'Day 5: caring for your wound during the days when infection is most likely, and what a healthy wound looks like.',
    uz: '5-kun: infeksiya ehtimoli eng yuqori boʻlgan kunlarda jarohatni parvarish qilish va sogʻlom jarohat qanday koʻrinishi.',
    ru: 'День 5: уход за раной в дни наибольшего риска инфекции и как выглядит здоровая рана.',
  },
  7: {
    en: 'Day 7: slowly returning to everyday activity, eating and drinking well, and looking after your bowels.',
    uz: '7-kun: kundalik faoliyatga asta-sekin qaytish, yaxshi ovqatlanish va ichak faoliyatiga eʼtibor berish.',
    ru: 'День 7: постепенное возвращение к повседневной активности, полноценное питание и питьё, забота о работе кишечника.',
  },
  14: {
    en: 'Day 14: reviewing your progress at the two-week mark and what is normal by now.',
    uz: '14-kun: ikki haftalik bosqichda erishilgan natijalarni koʻrib chiqish va shu paytga kelib nima normal hisoblanishi.',
    ru: 'День 14: оценка вашего прогресса на отметке в две недели и что к этому времени считается нормой.',
  },
  21: {
    en: 'Day 21: getting back to your usual routine safely and knowing when your recovery is on track.',
    uz: '21-kun: odatdagi hayot tarzingizga xavfsiz qaytish va tiklanishingiz toʻgʻri kechayotganini bilish.',
    ru: 'День 21: безопасное возвращение к привычному распорядку и как понять, что восстановление идёт по плану.',
  },
};

/**
 * Procedure names. The UZ label is used with the ablative "-dan keyin" and the RU
 * label is stored in the GENITIVE, so both read naturally in the sentence frames
 * below without any runtime case handling.
 */
const PROCEDURE_LABEL: Record<string, Localised> = {
  laparoscopic_appendectomy: {
    en: 'laparoscopic appendectomy (keyhole appendix surgery)',
    uz: 'laparoskopik appendektomiya (teshikcha orqali koʻrichak operatsiyasi)',
    ru: 'лапароскопической аппендэктомии (операции на аппендиксе через проколы)',
  },
  open_hernia_repair: {
    en: 'open hernia repair',
    uz: 'churrani ochiq usulda operatsiya qilish',
    ru: 'открытой операции по устранению грыжи',
  },
};

function educationEntries(procedureType: string): ContentPackEntry[] {
  const fallback: Localised = { en: procedureType, uz: procedureType, ru: procedureType };
  const label = PROCEDURE_LABEL[procedureType] ?? fallback;
  return EDUCATION_DAYS.map((day) => {
    const topic = EDUCATION_TOPICS[day];
    return {
      category: 'clinical',
      contentKey: `clinical.${procedureType}.day_${day}`,
      en: `Recovery after ${label.en}. ${topic.en}`,
      uz: `${label.uz}dan keyin tiklanish. ${topic.uz}`,
      ru: `Восстановление после ${label.ru}. ${topic.ru}`,
    };
  });
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
    ...confirmations,
    ...contact,
    ...checkinQuestions,
    ...taskContent,
    ...clinical,
  ];
}

/** The six safety keys, exported so the seed/tests can assert their presence. */
export const SAFETY_KEYS = safety.map((s) => s.contentKey);
/** The seven check-in question keys. */
export const CHECKIN_QUESTION_KEYS = checkinQuestions.map((q) => q.contentKey);

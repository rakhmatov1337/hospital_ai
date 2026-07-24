import { scoreMedicalSafety } from './medical-safety.scorer';
import {
  buildContentPack,
  SAFETY_KEYS,
} from '../../seed/content-pack';

/**
 * SP3-A Task 1 unit test — the repurposed deterministic QA judge must:
 *  1. FLAG known-bad medical judgment / reassurance / diagnosis language in
 *     EN, RU AND UZ (spec B12: guardrails must hold in all three languages).
 *  2. PASS neutral text, referrals-to-staff, and the six clinic-approved
 *     safety-critical strings.
 */
describe('scoreMedicalSafety', () => {
  describe('flags forbidden language (EN)', () => {
    const bad = [
      "Don't worry, it's fine.",
      "It's nothing serious.",
      'That looks normal to me.',
      "It's probably just gas.",
      'Sounds like a normal recovery.',
      'You have an infection.',
      'No need to worry, you will be fine.',
    ];
    it.each(bad)('flags %j', (text) => {
      const r = scoreMedicalSafety(text, 'en');
      expect(r.safe).toBe(false);
      expect(r.hits.length).toBeGreaterThan(0);
    });
  });

  describe('flags forbidden language (RU)', () => {
    const bad = [
      'Не переживайте, всё нормально.',
      'Ничего серьёзного, это нормально.',
      'Скорее всего ничего страшного.',
      'Не волнуйтесь, всё в порядке.',
      'У вас инфекция.',
    ];
    it.each(bad)('flags %j', (text) => {
      const r = scoreMedicalSafety(text, 'ru');
      expect(r.safe).toBe(false);
      expect(r.hits.length).toBeGreaterThan(0);
    });
  });

  describe('flags forbidden language (UZ)', () => {
    const bad = [
      'Tashvishlanmang, hammasi yaxshi.',
      'Bu jiddiy emas, normal holat.',
      'Ehtimol hech qanday muammo yo\'q.',
      "Qo'rqmang, hammasi joyida.",
      'Sizda infeksiya bor.',
    ];
    it.each(bad)('flags %j', (text) => {
      const r = scoreMedicalSafety(text, 'uz');
      expect(r.safe).toBe(false);
      expect(r.hits.length).toBeGreaterThan(0);
    });
  });

  describe('passes neutral / approved strings', () => {
    const good = [
      'Your answers have been sent to the care team.',
      'A staff member will review your check-in.',
      'Please contact your clinic if you have questions.',
      'Call 103 in an emergency.',
      'This information was approved by your clinic.',
      '', // empty
    ];
    it.each(good)('passes %j', (text) => {
      const r = scoreMedicalSafety(text, 'en');
      expect(r.safe).toBe(true);
      expect(r.hits).toEqual([]);
    });

    it('passes neutral RU text', () => {
      expect(
        scoreMedicalSafety(
          'Ваши ответы отправлены медицинской команде.',
          'ru',
        ).safe,
      ).toBe(true);
    });

    it('passes neutral UZ text', () => {
      expect(
        scoreMedicalSafety(
          'Javoblaringiz shifokorlar guruhiga yuborildi.',
          'uz',
        ).safe,
      ).toBe(true);
    });
  });

  describe('passes the six clinic-approved safety-critical strings', () => {
    const safetyEntries = buildContentPack(['appendectomy']).filter((e) =>
      SAFETY_KEYS.includes(e.contentKey),
    );

    it('resolves exactly the six safety strings', () => {
      expect(safetyEntries.length).toBe(6);
    });

    it.each(safetyEntries.map((e) => [e.contentKey, e.en] as const))(
      'safety string %s scores safe',
      (_key, en) => {
        const r = scoreMedicalSafety(en, 'en');
        expect(r.safe).toBe(true);
        expect(r.hits).toEqual([]);
      },
    );
  });
});

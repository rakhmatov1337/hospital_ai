import { detectRedFlags, EMERGENCY_CONTENT_KEY } from './red-flags';

/**
 * The input guard is safety-critical: a red-flag message must be caught in EVERY
 * language and must NOT depend on the model. These tests are the deterministic
 * proof the QA gate leans on.
 */
describe('detectRedFlags (SP7 input guard)', () => {
  const emergencies: Array<[string, 'en' | 'ru' | 'uz']> = [
    ['My wound has heavy bleeding and it wont stop', 'en'],
    ["I can't breathe properly since this morning", 'en'],
    ['I have chest pain', 'en'],
    ['У меня сильное кровотечение из раны', 'ru'],
    ['Мне трудно дышать', 'ru'],
    ['болит грудь и давит в груди', 'ru'],
    ["Yaramdan kuchli qon ketyapti", 'uz'],
    ['Nafas olishim qiyin', 'uz'],
    ["Ko'krak og'rig'i bor", 'uz'],
  ];

  it.each(emergencies)('flags an emergency message (%s / %s)', (msg, lang) => {
    const r = detectRedFlags(msg, lang);
    expect(r.triggered).toBe(true);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.contentKey).toBe(EMERGENCY_CONTENT_KEY);
  });

  const benign: Array<[string, 'en' | 'ru' | 'uz']> = [
    ['What time should I take my paracetamol?', 'en'],
    ['Can you remind me what my doctor said about walking?', 'en'],
    ['Когда мне менять повязку?', 'ru'],
    ['Bugun nima qilishim kerak?', 'uz'],
  ];

  it.each(benign)('does not fire on a benign question (%s / %s)', (msg, lang) => {
    expect(detectRedFlags(msg, lang).triggered).toBe(false);
  });
});

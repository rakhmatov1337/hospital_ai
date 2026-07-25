import {
  StreamingOutputGuard,
  guardFullReply,
  GUARD_FALLBACK_CONTENT_KEY,
} from './output-guard';

/**
 * The output guard must fail closed on any judgment / reassurance / diagnosis
 * language, and must never emit an unsafe sentence — even mid-stream.
 */
describe('guardFullReply (SP7 output guard)', () => {
  it('passes grounded, attributed content', () => {
    const r = guardFullReply(
      "Your clinic's guidance says to take paracetamol with water up to three times a day.",
      'en',
    );
    expect(r.safe).toBe(true);
  });

  it('blocks a judgment/reassurance reply and returns the fallback key', () => {
    const r = guardFullReply("Don't worry, your wound looks normal.", 'en');
    expect(r.safe).toBe(false);
    expect(r.fallbackKey).toBe(GUARD_FALLBACK_CONTENT_KEY);
  });

  it('blocks in Russian and Uzbek too', () => {
    expect(guardFullReply('Не переживайте, всё нормально.', 'ru').safe).toBe(false);
    expect(guardFullReply('Tashvishlanmang, hammasi yaxshi.', 'uz').safe).toBe(false);
  });
});

describe('StreamingOutputGuard', () => {
  it('releases whole safe sentences and withholds partial ones', () => {
    const g = new StreamingOutputGuard('en');
    let out = '';
    out += g.push('Your clinic ');
    out += g.push('advises rest. '); // first sentence completes here
    // The completed sentence is released; the trailing partial is held.
    expect(out).toContain('Your clinic advises rest.');
    expect(g.blocked).toBe(false);
  });

  it('latches blocked the moment an unsafe sentence completes, emitting nothing after', () => {
    const g = new StreamingOutputGuard('en');
    let out = '';
    out += g.push('Here is some info. ');
    out += g.push("Your wound is normal. "); // unsafe sentence completes -> block
    out += g.push('You can ignore it.'); // withheld
    expect(g.blocked).toBe(true);
    expect(out).toContain('Here is some info.');
    expect(out).not.toContain('normal');
    expect(out).not.toContain('ignore');
    expect(g.hits.length).toBeGreaterThan(0);
  });

  it('flush releases a trailing safe sentence with no terminator', () => {
    const g = new StreamingOutputGuard('en');
    const emitted = g.push('Please contact your clinic'); // no terminator -> buffered
    expect(emitted).toBe('');
    const tail = g.flush();
    expect(g.blocked).toBe(false);
    expect(tail).toContain('Please contact your clinic');
  });

  it('flush blocks an unsafe trailing fragment', () => {
    const g = new StreamingOutputGuard('en');
    const emitted = g.push('It is nothing serious'); // no terminator yet -> buffered
    expect(emitted).toBe('');
    const tail = g.flush();
    expect(g.blocked).toBe(true);
    expect(tail).toBe('');
  });
});

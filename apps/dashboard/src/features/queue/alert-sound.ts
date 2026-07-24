/**
 * A short, distinct two-tone alert for a new urgent/emergency arrival (spec §D2:
 * AUDIBLE + visual). Synthesised via the Web Audio API so there is no external
 * asset to bundle. All access is guarded — in a non-browser/test environment
 * (no `AudioContext`) it is a silent no-op.
 */

let ctx: AudioContext | null = null;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as AudioWindow;
  const Ctor = window.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Play the attention chime. Safe to call repeatedly; never throws. */
export function playAlertSound(): void {
  try {
    const audio = getContext();
    if (!audio) return;
    // Some browsers suspend the context until a user gesture — resume best-effort.
    if (audio.state === 'suspended') void audio.resume();

    const start = audio.currentTime;
    const tones = [880, 660]; // two descending tones, ~0.3s each
    tones.forEach((freq, i) => {
      const at = start + i * 0.35;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    });
  } catch {
    /* audio is best-effort; the visual alert is the accessible fallback */
  }
}

/**
 * SP7 output guard — the last line before any assistant text reaches a patient.
 *
 * The model is NEVER trusted. Every sentence the assistant produces is scanned
 * with the SAME deterministic `scoreMedicalSafety` detector the SP3-A QA gate
 * uses (single source of truth — the gate and the runtime guard cannot drift).
 * If a sentence contains any judgment / reassurance / diagnosis / minimisation
 * language, the guard FAILS CLOSED: the reply is discarded and replaced with the
 * approved "contact your clinic" content.
 *
 * Streaming-safe design: we buffer tokens and only release COMPLETE sentences
 * that pass the scan. A partial sentence is held back until its terminator
 * arrives, so an unsafe sentence is never shown even momentarily. On a violation
 * the stream is cut and the fallback content key is emitted instead.
 *
 * Deliberately Mastra-free so the service and tests use it without loading the
 * agent framework.
 */
import { scoreMedicalSafety, type ScorerLang } from '../scorers/medical-safety.scorer';

export type GuardVerdict = 'passed' | 'replaced' | 'red_flag_bypass';

/** The approved content key surfaced when the guard blocks a reply. */
export const GUARD_FALLBACK_CONTENT_KEY = 'contact.body';

/** Split on sentence terminators, keeping the terminator with the sentence. */
function splitSentences(text: string): string[] {
  // Terminators across the three languages share ASCII . ! ? plus the newline.
  const parts = text.match(/[^.!?\n]*[.!?\n]|[^.!?\n]+$/g);
  return parts ? parts.map((s) => s).filter((s) => s.trim().length > 0) : [];
}

/**
 * Scan a full assistant reply. Returns whether it is safe to send as-is, and if
 * not, the fallback content key to send instead. Used for the non-streaming path
 * and as the final whole-message check.
 */
export function guardFullReply(
  text: string,
  lang: ScorerLang,
): { safe: boolean; hits: string[]; fallbackKey?: string } {
  const { safe, hits } = scoreMedicalSafety(text, lang);
  return safe ? { safe: true, hits: [] } : { safe: false, hits, fallbackKey: GUARD_FALLBACK_CONTENT_KEY };
}

/**
 * A streaming guard. Feed it token chunks; it emits only whole, safe sentences.
 * The moment a completed sentence is unsafe, it latches `blocked` and emits
 * nothing further — the caller then sends the approved fallback content.
 *
 *   const g = new StreamingOutputGuard('en');
 *   for await (const token of modelStream) {
 *     const safeText = g.push(token);
 *     if (g.blocked) break;         // stop reading the model
 *     if (safeText) send(safeText);
 *   }
 *   const tail = g.flush();          // release any trailing safe sentence
 *   if (g.blocked) sendApproved(GUARD_FALLBACK_CONTENT_KEY);
 */
export class StreamingOutputGuard {
  private buffer = '';
  /** True once an unsafe sentence was detected — nothing is emitted after. */
  blocked = false;
  /** Forbidden phrases seen (audit trail). */
  readonly hits: string[] = [];

  constructor(private readonly lang: ScorerLang) {}

  /** Push a token; returns any newly-cleared safe text (possibly empty). */
  push(token: string): string {
    if (this.blocked) return '';
    this.buffer += token;
    return this.drainCompleteSentences();
  }

  /** Release a trailing sentence with no terminator (end of stream). */
  flush(): string {
    if (this.blocked) return '';
    const remainder = this.buffer;
    this.buffer = '';
    if (remainder.trim().length === 0) return '';
    const { safe, hits } = scoreMedicalSafety(remainder, this.lang);
    if (!safe) {
      this.blocked = true;
      this.hits.push(...hits);
      return '';
    }
    return remainder;
  }

  private drainCompleteSentences(): string {
    let released = '';
    // Only whole sentences (terminated) can be scanned + released.
    const match = /^[\s\S]*?[.!?\n]/;
    let m: RegExpExecArray | null;
    while ((m = match.exec(this.buffer)) !== null) {
      const sentence = m[0];
      this.buffer = this.buffer.slice(sentence.length);
      const { safe, hits } = scoreMedicalSafety(sentence, this.lang);
      if (!safe) {
        this.blocked = true;
        this.hits.push(...hits);
        return released; // stop — everything after is withheld
      }
      released += sentence;
    }
    return released;
  }
}

export { splitSentences };

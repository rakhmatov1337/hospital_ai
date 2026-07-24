import { useEffect, useRef, useState } from 'react';
import type { EscalationQueue, QueueFilter } from './api';
import { playAlertSound } from './alert-sound';

/**
 * Fires an AUDIBLE + visual alert when a NEW urgent/emergency escalation arrives
 * (spec §D2). Detection diffs the set of critical (emergency + urgent) ids across
 * successive fetches: any id present now that was not present before is a new
 * arrival.
 *
 * Guards:
 *  - the FIRST populated fetch seeds the baseline and never alerts (existing
 *    items are not "new");
 *  - changing the filter (Unresolved ↔ All) re-seeds the baseline, so revealing
 *    already-open items via "All" does not masquerade as an arrival.
 *
 * TanStack Query's structural sharing means `data`'s reference only changes when
 * the payload actually changes, so this effect re-evaluates exactly when it must.
 */
export interface NewArrivalAlert {
  /** A new critical item arrived since last acknowledgement — show the banner. */
  active: boolean;
  /** Dismiss the visual banner (audio is one-shot). */
  dismiss: () => void;
}

export function useNewArrivalAlert(
  data: EscalationQueue | undefined,
  filter: QueueFilter,
): NewArrivalAlert {
  const knownIds = useRef<Set<string> | null>(null);
  const seededFilter = useRef<QueueFilter>(filter);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!data) return;

    const criticalIds = [...data.sections.emergency, ...data.sections.urgent].map((i) => i.id);
    const current = new Set(criticalIds);

    // Seed (first data or a filter switch) — establish a baseline, do not alert.
    if (knownIds.current === null || seededFilter.current !== filter) {
      knownIds.current = current;
      seededFilter.current = filter;
      return;
    }

    const previous = knownIds.current;
    const hasNewArrival = criticalIds.some((id) => !previous.has(id));
    knownIds.current = current;

    if (hasNewArrival) {
      setActive(true);
      playAlertSound();
    }
  }, [data, filter]);

  return { active, dismiss: () => setActive(false) };
}

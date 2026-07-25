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
  /** Which tier the newest arrival was, so the banner can reflect emergency vs urgent. */
  arrivedTier: 'emergency' | 'urgent' | null;
  /** Dismiss the visual banner (audio is one-shot). */
  dismiss: () => void;
}

export interface NewArrivalAlertOptions {
  /**
   * Play the audible chime on arrival. Set false where a second instance already
   * owns the sound (the shell plays it app-wide; the Queue shows the visual banner
   * only) to avoid a double chime.
   */
  playSound?: boolean;
}

export function useNewArrivalAlert(
  data: EscalationQueue | undefined,
  filter: QueueFilter,
  options: NewArrivalAlertOptions = {},
): NewArrivalAlert {
  const { playSound = true } = options;
  const knownIds = useRef<Set<string> | null>(null);
  const seededFilter = useRef<QueueFilter>(filter);
  const [active, setActive] = useState(false);
  const [arrivedTier, setArrivedTier] = useState<'emergency' | 'urgent' | null>(null);

  useEffect(() => {
    if (!data) return;

    const emergencyIds = data.sections.emergency.map((i) => i.id);
    const urgentIds = data.sections.urgent.map((i) => i.id);
    const criticalIds = [...emergencyIds, ...urgentIds];
    const current = new Set(criticalIds);

    // Seed (first data or a filter switch) — establish a baseline, do not alert.
    if (knownIds.current === null || seededFilter.current !== filter) {
      knownIds.current = current;
      seededFilter.current = filter;
      return;
    }

    const previous = knownIds.current;
    const newEmergency = emergencyIds.some((id) => !previous.has(id));
    const newUrgent = urgentIds.some((id) => !previous.has(id));
    knownIds.current = current;

    if (newEmergency || newUrgent) {
      setActive(true);
      // Emergency takes precedence in the banner tone/copy.
      setArrivedTier(newEmergency ? 'emergency' : 'urgent');
      if (playSound) playAlertSound();
    }
  }, [data, filter, playSound]);

  return { active, arrivedTier, dismiss: () => setActive(false) };
}

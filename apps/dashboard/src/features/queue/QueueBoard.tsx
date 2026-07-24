import { useTranslation } from 'react-i18next';
import { EscalationStatus } from '@hospital-ai/shared-types';
import { QueueRow, QueueSectionHeader, TIER_ORDER } from '../../ui';
import type { EscalationQueue, EscalationQueueItem } from './api';
import { isTestItem } from './api';

export interface QueueBoardProps {
  data: EscalationQueue;
  /** Escalation-timing thresholds (from clinic settings), in minutes. */
  urgentAfterMinutes?: number;
  breachAfterMinutes?: number;
  onRowClick: (id: string) => void;
}

/**
 * Presentational queue board — renders the three tier sections in the FIXED
 * order Emergency → Urgent → Routine (never reordered). Every section is always
 * shown with its live count badge, even when empty, so a section can never be
 * collapsed away. No pagination and no truncation: every unresolved item the
 * server returned is rendered, so an unresolved urgent item is never hidden.
 */
export function QueueBoard({
  data,
  urgentAfterMinutes = 15,
  breachAfterMinutes = 30,
  onRowClick,
}: QueueBoardProps) {
  const { t } = useTranslation('queue');

  return (
    <div className="flex flex-col gap-6">
      {TIER_ORDER.map((tier) => {
        const items = data.sections[tier];
        return (
          <section key={tier} aria-label={tier} className="flex flex-col gap-3">
            <QueueSectionHeader tier={tier} count={items.length} />
            {items.length === 0 ? (
              <p className="px-4 py-2 text-caption text-text-muted">
                {t('section.empty', { defaultValue: 'No items in this section' })}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <QueueRow
                    key={item.id}
                    patientName={item.patientName}
                    recoveryDay={item.recoveryDay ?? 0}
                    submittedAt={item.createdAt}
                    status={item.status}
                    tier={item.tier}
                    acknowledged={isLadderHalted(item)}
                    isTest={isTestItem(item)}
                    urgentAfterMinutes={urgentAfterMinutes}
                    breachAfterMinutes={breachAfterMinutes}
                    onClick={() => onRowClick(item.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The SLA ladder is halted once an item is acknowledged or contacted. */
function isLadderHalted(item: EscalationQueueItem): boolean {
  return (
    item.status === EscalationStatus.acknowledged || item.status === EscalationStatus.contacted
  );
}

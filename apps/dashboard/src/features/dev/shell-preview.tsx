import { EscalationStatus, Tier } from '@hospital-ai/shared-types';
import { Card, MetricCard, StatusChip, TierBadge, Button } from '../../ui';

/** DEV-ONLY preview of the app shell with sample content (route `/dev/shell`). Safe to delete. */
export function ShellPreview() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display font-bold text-text">Review queue</h1>
        <p className="mt-1 text-body text-text-muted">Live — refreshes automatically.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard value="80%" label="Adherence" denominator="4 of 5 patients" />
        <MetricCard value="12" label="Escalations" denominator="this week" />
        <MetricCard value="3" label="Awaiting review" denominator="unresolved" />
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h2 font-semibold text-text">Recent escalations</h2>
          <Button variant="ghost" size="sm">View all</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <TierBadge tier={Tier.emergency} />
          <TierBadge tier={Tier.urgent} />
          <TierBadge tier={Tier.routine} />
          <StatusChip status={EscalationStatus.new} />
          <StatusChip status={EscalationStatus.acknowledged} />
        </div>
      </Card>
    </div>
  );
}

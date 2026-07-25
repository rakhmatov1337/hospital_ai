import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '../lib/cn';

export interface MetricCardProps {
  /** Large headline value, e.g. "80%". */
  value: ReactNode;
  /** Caption label, e.g. "Recovery-plan adherence". */
  label: string;
  /**
   * Denominator — ALWAYS shown (spec §2). e.g. "4 of 5 patients".
   * A metric card is never rendered without its denominator.
   */
  denominator: string;
  className?: string;
}

/** Metric card — Display number, Caption label, denominator beneath (muted). */
export function MetricCard({ value, label, denominator, className }: MetricCardProps) {
  return (
    <Card
      className={cn(
        'flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card',
        className,
      )}
    >
      <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="text-display text-text tabular-nums">{value}</span>
      <span className="text-caption text-text-muted">{denominator}</span>
    </Card>
  );
}

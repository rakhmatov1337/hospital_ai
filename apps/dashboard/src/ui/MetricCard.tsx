import type { ReactNode } from 'react';
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

/**
 * A single stat — label, big value, denominator beneath. Rendered borderless so it
 * sits as a cell inside a bordered `MetricStrip` (hairline-divided), matching the
 * flat/editorial queue style rather than a floating card.
 */
export function MetricCard({ value, label, denominator, className }: MetricCardProps) {
  return (
    <div className={cn('flex flex-col gap-1 bg-card p-4', className)}>
      <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="text-display text-text tabular-nums leading-none">{value}</span>
      <span className="text-caption text-text-muted">{denominator}</span>
    </div>
  );
}

/**
 * Bordered stat strip — wraps `MetricCard` cells with hairline dividers (the
 * `gap-px` over a `bg-border` container reveals 1px rules between cells).
 */
export function MetricStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-px overflow-hidden rounded-input border border-border bg-border sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

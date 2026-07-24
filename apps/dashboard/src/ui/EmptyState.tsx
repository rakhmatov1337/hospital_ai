import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** e.g. a "last updated" caption for the queue's calm empty state. */
  footer?: ReactNode;
  className?: string;
}

/** Calm empty state — clear "nothing needs attention" messaging. */
export function EmptyState({ title, description, icon, action, footer, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface p-8 text-center',
        className,
      )}
    >
      {icon && <div className="text-text-muted">{icon}</div>}
      <p className="text-h2 font-semibold text-text">{title}</p>
      {description && <p className="max-w-prose text-body text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
      {footer && <div className="mt-2 text-caption text-text-muted">{footer}</div>}
    </div>
  );
}

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Leading icon override; each tone has a distinct default shape (not colour alone). */
  icon?: ReactNode;
  className?: string;
}

const TONES: Record<BannerTone, { box: string; icon: string }> = {
  info: { box: 'bg-primary/5 border-primary', icon: 'ⓘ' },
  warning: { box: 'bg-muted border-tier-urgent', icon: '⚠' },
  danger: { box: 'bg-muted border-destructive', icon: '■' },
  success: { box: 'bg-muted border-success', icon: '✓' },
};

/** Inline banner. Used for notices and the placeholder-content warning. */
export function Banner({ tone = 'info', title, children, action, icon, className }: BannerProps) {
  const style = TONES[tone];
  return (
    <Alert
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-card border-l-4 px-4 py-3 text-body text-foreground',
        style.box,
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 text-h2 leading-none">
        {icon ?? style.icon}
      </span>
      <div className="flex-1">
        {title && <AlertTitle className="font-semibold text-foreground">{title}</AlertTitle>}
        {children && <AlertDescription className="text-body text-foreground">{children}</AlertDescription>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Alert>
  );
}
